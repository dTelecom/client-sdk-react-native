import { TextDecoder, TextEncoder } from 'util';

describe('text encoding on Hermes', () => {
  const encoder = Object.getOwnPropertyDescriptor(globalThis, 'TextEncoder');
  const decoder = Object.getOwnPropertyDescriptor(globalThis, 'TextDecoder');

  afterEach(() => {
    for (const [name, descriptor] of [
      ['TextEncoder', encoder],
      ['TextDecoder', decoder],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  it('decodes UTF-8 chat when only a native encoder is available', () => {
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      value: TextEncoder,
    });
    Reflect.deleteProperty(globalThis, 'TextDecoder');
    jest.isolateModules(() => require('../textEncoding'));

    const message = 'Hello κόσμε 🌍';
    const bytes = new TextEncoder().encode(message);
    expect(new globalThis.TextDecoder().decode(bytes)).toBe(message);
    expect(globalThis.TextEncoder).toBe(TextEncoder);
  });

  it('keeps both native constructors when available', () => {
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      value: TextEncoder,
    });
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      value: TextDecoder,
    });
    jest.isolateModules(() => require('../textEncoding'));
    expect(globalThis.TextEncoder).toBe(TextEncoder);
    expect(globalThis.TextDecoder).toBe(TextDecoder);
  });
});
