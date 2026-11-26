// dTelecom's browser Chat component publishes UTF-8 JSON on this reliable data channel.
// registerGlobals installs these UTF-8 APIs on Hermes.
declare const TextEncoder: new () => { encode(value: string): Uint8Array };
declare const TextDecoder: new () => { decode(value: Uint8Array): string };

export const chatTopic = 'lk-chat-topic';

export function encodeChat(message: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ message, timestamp: Date.now(), type: 'text' }));
}

export function decodeChat(payload: Uint8Array, topic?: string): string | undefined {
  if (topic !== chatTopic) return undefined;
  try {
    const chat = JSON.parse(new TextDecoder().decode(payload));
    if (typeof chat?.message === 'string' && (chat.type === 'text' || chat.type === undefined)) {
      return chat.message;
    }
  } catch {
    // Other integrations can send their own data messages.
  }
  return undefined;
}
