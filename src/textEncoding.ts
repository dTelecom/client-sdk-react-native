import { TextDecoder, TextEncoder } from 'text-encoding-utf-8';

// Hermes can provide TextEncoder independently of TextDecoder. Install the
// missing constructor before the room client initializes its protocol codecs.
if (typeof globalThis.TextDecoder === 'undefined') {
  Object.assign(globalThis, { TextDecoder });
}
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.assign(globalThis, { TextEncoder });
}
