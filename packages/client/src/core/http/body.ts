const MAX_JSON_BODY_BYTES = 64 * 1024 * 1024;

function bodyTooLarge(path: string, bytes: number): Error {
  return new Error(`${path} answered more than ${MAX_JSON_BODY_BYTES} bytes (${bytes})`);
}

async function readBoundedText(res: Response, path: string): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    if (text.length > MAX_JSON_BODY_BYTES) throw bodyTooLarge(path, text.length);
    return text;
  }
  const decoder = new TextDecoder();
  let text = '';
  let read = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    read += chunk.value.byteLength;
    if (read > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw bodyTooLarge(path, read);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

export async function readBoundedJson(res: Response, path: string): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined;
  const text = await readBoundedText(res, path);
  return text ? JSON.parse(text) : undefined;
}
