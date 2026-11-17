interface Reading {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  limit: number;
}

async function drained(reading: Reading, text: string, size: number): Promise<string | null> {
  const { reader, decoder, limit } = reading;
  const chunk = await reader.read();
  if (chunk.done) {
    return text + decoder.decode();
  }
  const read = size + chunk.value.byteLength;
  if (read > limit) {
    await reader.cancel();
    return null;
  }
  return drained(reading, text + decoder.decode(chunk.value, { stream: true }), read);
}

/**
 * A request's body as text, or null once it runs past `limit` bytes. A
 * declared length past the limit is refused unread; a body that declares none
 * is read chunk by chunk and dropped at the first byte too many.
 */
export async function boundedText(
  request: Pick<Request, 'headers' | 'body'>,
  limit: number,
): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > limit) {
    return null;
  }
  const reader = request.body?.getReader();
  return reader ? drained({ reader, decoder: new TextDecoder(), limit }, '', 0) : '';
}
