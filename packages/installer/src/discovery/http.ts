import { get } from 'node:https';
import type { ZodType } from 'zod';

const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_MAX_BYTES = 64 * 1024;
const OK = 200;

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** For a television that signs its own certificate, which is all of them. */
  insecureTls?: boolean;
}

/** The body as text, or null for any refusal: unreachable, not ok, or too big. */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string | null> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = options;
  if (options.insecureTls) return getUnverified(url, timeoutMs, maxBytes);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await readBounded(response, maxBytes);
  } catch {
    return null;
  }
}

/** As `fetchText`, held to a schema: anything on the link can answer a probe. */
export async function fetchJson<T>(
  url: string,
  schema: ZodType<T>,
  options: FetchOptions = {},
): Promise<T | null> {
  const text = await fetchText(url, options);
  if (text === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function getUnverified(url: string, timeoutMs: number, maxBytes: number): Promise<string | null> {
  return new Promise((resolve) => {
    const refuse = () => resolve(null);
    try {
      const request = get(
        url,
        { rejectUnauthorized: false, signal: AbortSignal.timeout(timeoutMs) },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('error', refuse);
          response.on('data', (chunk: Buffer) => {
            size += chunk.byteLength;
            if (size <= maxBytes) return chunks.push(chunk);
            refuse();
            return request.destroy();
          });
          response.on('end', () => {
            resolve(response.statusCode === OK ? Buffer.concat(chunks).toString('utf8') : null);
          });
        },
      );
      request.on('error', refuse);
    } catch {
      refuse();
    }
  });
}

async function readBounded(response: Response, maxBytes: number): Promise<string | null> {
  if (Number(response.headers.get('content-length') ?? '0') > maxBytes) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
