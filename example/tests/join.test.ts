import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { parseInvite, joinInvite, readInviteQR } from '../src/invite.ts';
import { decodeChat, encodeChat } from '../src/chat.ts';

const trusted = { 'https://meet.example': 'meet', 'https://live.example': 'live' } as const;
test('the shipped issuer list accepts public Meet and Live invites', () => {
  for (const [origin, product] of [
    ['https://dtelecom-meet.vercel.app', 'meet'],
    ['https://dtelecom-live.vercel.app', 'live'],
  ]) {
    const invite = parseInvite(origin + '/prejoin?room=weekly%20call#host=signature');
    assert.deepEqual(invite, { origin, product, room: 'weekly call', hostKey: 'signature' });
  }
});

test('QR scans preserve the original invite, including the signed host fragment', () => {
  const invite = 'https://dtelecom-live.vercel.app/prejoin?room=A%20B#host=abc%2Bdef%3D';
  assert.equal(readInviteQR(invite), invite);
  assert.equal(parseInvite(readInviteQR(invite)).hostKey, 'abc+def=');
  assert.throws(() => readInviteQR('https://other.example/prejoin?room=A'));
  assert.throws(() => readInviteQR('https://dtelecom-meet.vercel.app/other?room=A'));
});

test('host key is read only from fragment on a configured origin', () => {
  const invite = parseInvite('https://meet.example/prejoin?room=A%20B#host=signature', trusted);
  assert.deepEqual(invite, {origin: 'https://meet.example', product: 'meet', room: 'A B', hostKey: 'signature'});
  for (const link of ['https://meet.example.attacker.invalid/prejoin?room=A#host=s', 'https://meet.example@other.example/prejoin?room=A', 'https://meet.example/other?room=A']) {
    assert.throws(() => parseInvite(link, trusted));
  }
  assert.equal(parseInvite('https://live.example/prejoin?room=A&host=s', trusted).hostKey, undefined);
});
test('admission posts only to the issuer and preserves server roles and optional fallback', async () => {
  const invite = parseInvite('https://live.example/prejoin?room=A', trusted);
  const result = {token:'signed', wsUrl:'wss://first.example', role:'viewer', fallbackUrls:['wss://next.example']};
  const fetch = mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url,'https://live.example/api/join');
    assert.deepEqual(JSON.parse(init.body),{room:'A',identity:'Pilot'});
    return Response.json(result);
  });
  try {
    assert.deepEqual(await joinInvite(invite,' Pilot ', new AbortController().signal),result);
    await assert.rejects(joinInvite({...invite,hostKey:'invalid'},'Pilot',new AbortController().signal));
  } finally { fetch.mock.restore(); }
});
test('chat interoperates with the browser wire format and skips other topics', () => {
  const data=encodeChat('Γειά');
  const wire=JSON.parse(new TextDecoder().decode(data));
  assert.equal(wire.message, 'Γειά');
  assert.equal(wire.type, 'text');
  assert.equal(typeof wire.timestamp, 'number');
  assert.equal(decodeChat(data,'lk-chat-topic'), 'Γειά');
  assert.equal(decodeChat(data,'other'), undefined);
  assert.equal(decodeChat(new Uint8Array([1]),'lk-chat-topic'), undefined);
});
