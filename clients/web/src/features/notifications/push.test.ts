import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, bytesToBase64Url } from './push';

// These two are the boundary between the server's VAPID key and the browser's
// PushManager. Getting either wrong doesn't throw — it produces a subscription
// the server can never encrypt for, and pushes silently vanish.
describe('base64url conversion', () => {
  it('decodes a real VAPID public key to a 65-byte uncompressed point', () => {
    // The RFC 8291 example application-server public key.
    const key =
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
    const bytes = base64UrlToBytes(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) bytes[i] = i;
    expect(Array.from(base64UrlToBytes(bytesToBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it('encodes with the url-safe alphabet and no padding', () => {
    // 0xFB 0xFF is "+/8=" in standard base64; url-safe unpadded is "-_8".
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(bytesToBase64Url(new Uint8Array([0, 0, 0, 0]))).not.toContain('=');
  });

  it('decodes url-safe input regardless of padding', () => {
    expect(Array.from(base64UrlToBytes('-_8'))).toEqual([0xfb, 0xff]);
    expect(Array.from(base64UrlToBytes('-_8='))).toEqual([0xfb, 0xff]);
  });

  it('produces a buffer PushManager will accept', () => {
    // `applicationServerKey` needs a view over a plain ArrayBuffer; a shared one
    // is rejected by the type system and by some browsers at runtime.
    const bytes = base64UrlToBytes('-_8');
    expect(bytes.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
