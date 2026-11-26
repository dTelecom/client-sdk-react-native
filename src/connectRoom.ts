import type { Room, RoomConnectOptions } from '@dtelecom/livekit-client';

export interface RoomCredentials {
  wsUrl: string;
  token: string;
  /** Additional signaling endpoints supplied by the same trusted issuer. */
  fallbackUrls?: string[];
}

/** Connect using the issuing backend's grant and ordered signaling endpoints. */
export function connectRoom(
  room: Room,
  { wsUrl, token, fallbackUrls }: RoomCredentials,
  options?: Omit<RoomConnectOptions, 'fallbackUrls'>
): Promise<void> {
  return room.connect(wsUrl, token, { ...options, fallbackUrls });
}
