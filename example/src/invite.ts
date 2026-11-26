export type Product = 'meet' | 'live';
export type Role = 'host' | 'guest' | 'viewer';
export type Issuers = Readonly<Record<string, Product>>;

export const issuers: Issuers = {
  'https://dtelecom-meet-demo.vercel.app': 'meet',
  'https://dtelecom-live.vercel.app': 'live',
};

export interface Invite {
  origin: string;
  product: Product;
  room: string;
  hostKey?: string;
}

export interface Admission {
  token: string;
  wsUrl: string;
  fallbackUrls?: string[];
  role: Role;
}

export function parseInvite(link: string, trusted: Issuers = issuers): Invite {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new Error('Paste a complete Meet or Live invite link.');
  }
  const product = Object.hasOwn(trusted, url.origin) && trusted[url.origin];
  const loopback = ['localhost', '127.0.0.1', '10.0.2.2', '[::1]'].includes(url.hostname);
  if (!product || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
      url.username || url.password) {
    throw new Error('This invite is from an unconfigured deployment.');
  }
  const room = url.searchParams.get('room');
  if (url.pathname !== '/prejoin' || !room?.trim()) {
    throw new Error('Use the meeting or stream’s /prejoin invite link.');
  }
  const hostKey = new URLSearchParams(url.hash.slice(1)).get('host') || undefined;
  return { origin: url.origin, product, room, hostKey };
}

export async function joinInvite(invite: Invite, name: string, signal: AbortSignal): Promise<Admission> {
  if (!name.trim()) throw new Error('Enter your name before joining.');
  const response = await fetch(invite.origin + '/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: invite.room, identity: name.trim(), hostKey: invite.hostKey }),
    signal,
  });
  if (!response.ok) throw new Error(`The invitation service could not admit you (HTTP ${response.status}).`);
  const result = await response.json();
  const guestRole = invite.product === 'meet' ? 'guest' : 'viewer';
  if (typeof result?.token !== 'string' || !result.token || typeof result.wsUrl !== 'string' ||
      !result.wsUrl.startsWith('wss://') || (result.role !== 'host' && result.role !== guestRole)) {
    throw new Error('The invitation service returned invalid room details.');
  }
  if (invite.hostKey && result.role !== 'host') {
    throw new Error('The host link was rejected. Request a new host link or use a guest invite.');
  }
  if (result.fallbackUrls !== undefined && (!Array.isArray(result.fallbackUrls) ||
      result.fallbackUrls.some((url: unknown) => typeof url !== 'string' || !url.startsWith('wss://')))) {
    throw new Error('The invitation service returned invalid alternate nodes.');
  }
  return { role: result.role, token: result.token, wsUrl: result.wsUrl, fallbackUrls: result.fallbackUrls };
}
