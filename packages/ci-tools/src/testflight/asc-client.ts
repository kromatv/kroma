import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { type AscKey, ascToken } from './asc-token';

const API = 'https://api.appstoreconnect.apple.com/v1';
const ATTEMPTS = 4;
const BACKOFF_MS = 2000;
const MAX_BODY = 4 * 1024 * 1024;

const ErrorBody = z.object({
  errors: z.array(z.object({ code: z.string().optional(), detail: z.string().optional() })),
});

/** A refusal from App Store Connect, with its HTTP status and Apple's own words. */
export class AscError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    request: string,
  ) {
    super(`App Store Connect ${request} answered ${status}: ${detail}`);
  }
}

/** The App Store Connect REST API, every answer checked against a schema. */
export interface Asc {
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
  post(path: string, body: unknown): Promise<void>;
  create<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length > MAX_BODY) {
    throw new Error(`App Store Connect answered ${text.length} bytes, more than ${MAX_BODY}`);
  }
  return text ? JSON.parse(text) : {};
}

function explain(body: unknown): string {
  const parsed = ErrorBody.safeParse(body);
  if (!parsed.success) {
    return 'no error detail';
  }
  return parsed.data.errors.map((e) => e.detail ?? e.code ?? '?').join('; ');
}

const retryable = (status: number) => status === 429 || status >= 500;

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function send(key: AscKey, fetcher: Fetch) {
  const attempt = async (call: Call, n: number): Promise<unknown> => {
    const headers = {
      authorization: `Bearer ${await ascToken(key)}`,
      'content-type': 'application/json',
    };
    const body = call.body === undefined ? undefined : JSON.stringify(call.body);
    const res = await fetcher(`${API}/${call.path}`, { method: call.method, headers, body });
    const answer = await readBody(res);
    if (res.ok) {
      return answer;
    }
    if (!retryable(res.status) || n >= ATTEMPTS) {
      throw new AscError(res.status, explain(answer), `${call.method} ${call.path.split('?')[0]}`);
    }
    await delay(BACKOFF_MS * 2 ** (n - 1));
    return attempt(call, n + 1);
  };
  return (method: string, path: string, body?: unknown) => attempt({ method, path, body }, 1);
}

/** A client signed with `key`. `fetcher` stands in for the network in tests. */
export function ascClient(key: AscKey, fetcher: Fetch = fetch): Asc {
  const call = send(key, fetcher);
  return {
    get: async (path, schema) => schema.parse(await call('GET', path)),
    post: async (path, body) => {
      await call('POST', path, body);
    },
    create: async (path, body, schema) => schema.parse(await call('POST', path, body)),
  };
}
