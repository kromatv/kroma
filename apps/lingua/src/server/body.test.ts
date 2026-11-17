import { describe, expect, it } from 'vitest';
import { boundedText } from './body';

const post = (body: string | null, headers: Record<string, string> = {}) =>
  new Request('https://lingua.test/api/edits', { method: 'POST', body, headers });

const streamed = (body: ReadableStream<Uint8Array<ArrayBuffer>>) => ({ headers: new Headers(), body });

function chunked(chunks: readonly string[], pulled: { count: number }): ReadableStream<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const left = [...chunks];
  return new ReadableStream({
    pull(controller) {
      const next = left.shift();
      pulled.count += 1;
      if (next === undefined) {
        controller.close();
      } else {
        controller.enqueue(encoder.encode(next));
      }
    },
  });
}

describe('boundedText', () => {
  it('reads a body within its bound, and nothing as the empty text', async () => {
    expect(await boundedText(post('{"a":"é"}'), 16)).toBe('{"a":"é"}');
    expect(await boundedText(post(null), 16)).toBe('');
  });

  it('refuses a body that declares a length past its bound, unread', async () => {
    const request = post('{}', { 'content-length': '17' });

    expect(await boundedText(request, 16)).toBeNull();
    expect(request.bodyUsed).toBe(false);
  });

  it('counts bytes, not characters', async () => {
    expect(await boundedText(post('éééé'), 7)).toBeNull();
    expect(await boundedText(post('éééé'), 8)).toBe('éééé');
  });

  it('stops reading a body with no declared length at the first chunk past its bound', async () => {
    const pulled = { count: 0 };
    const stream = chunked(['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee', 'ffff'], pulled);

    expect(await boundedText(streamed(stream), 6)).toBeNull();
    expect(pulled.count).toBeLessThan(6);
  });

  it('puts a character split across two chunks back together', async () => {
    const bytes = new TextEncoder().encode('é');
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1));
        controller.enqueue(bytes.slice(1));
        controller.close();
      },
    });

    expect(await boundedText(streamed(stream), 16)).toBe('é');
  });
});
