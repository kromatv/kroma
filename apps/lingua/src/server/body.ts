/**
 * A request's body as text, or null once it runs past `limit` bytes. A
 * declared length past the limit is refused unread; a body that declares none
 * is read chunk by chunk and dropped at the first byte too many.
 */
export async function boundedText(request: Pick<Request, 'headers' | 'body'>, limit: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > limit) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return '';
  }
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}
