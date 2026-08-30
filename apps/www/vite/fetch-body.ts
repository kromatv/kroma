interface Options {
  headers?: HeadersInit;
  timeoutMs: number;
  maxBytes: number;
  backoffMs?: number;
}

const ATTEMPTS = 3;
const BACKOFF_MS = 500;

// A status the origin may answer differently a moment later. Every other one,
// 401 and 404 included, is the same answer however often it is asked.
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

class Permanent extends Error {}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// `fetch` reports a reset connection, a refused one and a DNS failure alike, as
// a bare "fetch failed"; what happened is one level down in `cause`.
function chain(err: unknown): string {
  const messages: string[] = [];
  for (let step: unknown = err, depth = 0; step instanceof Error && depth < 4; depth++) {
    messages.push(step.message);
    step = step.cause;
  }
  return messages.join(': ') || String(err);
}

async function once(url: string, options: Options): Promise<string> {
  const res = await fetch(url, {
    headers: options.headers,
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!res.ok) {
    const answered = `${url} answered ${res.status} ${res.statusText}`;
    if (TRANSIENT_STATUS.has(res.status)) throw new Error(answered);
    throw new Permanent(answered);
  }

  const body = await res.text();
  if (body.length > options.maxBytes) {
    const over = `${url} returned ${body.length} bytes, over the ${options.maxBytes} ceiling`;
    throw new Permanent(over);
  }
  return body;
}

/**
 * Reads a URL at build time and returns the body. A connection failure, a
 * timeout and a transient status are retried with a widening backoff; a 4xx and
 * a body over `maxBytes` are final. The thrown message carries the whole cause
 * chain.
 */
export async function fetchBody(url: string, options: Options): Promise<string> {
  const backoff = options.backoffMs ?? BACKOFF_MS;
  let last: unknown;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await wait(backoff * (attempt - 1));
    try {
      return await once(url, options);
    } catch (err) {
      if (err instanceof Permanent) throw err;
      last = err;
    }
  }

  throw new Error(`${url} could not be read after ${ATTEMPTS} attempts: ${chain(last)}`);
}
