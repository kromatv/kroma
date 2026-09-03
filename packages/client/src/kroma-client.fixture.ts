import { domains } from './api/discover';
import type { Domains } from './core/client';
import { type ClientControls, createKromaClient, type KromaClient } from './kroma-client';

interface RecordedCall {
  method: string;
  url: string;
  path: string;
  headers: Headers;
  body: unknown;
}

interface Reply {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}

const BASE = 'http://kroma.test';

/** The session bearer `recordRequest` signs its calls with. */
export const BEARER = 'session-bearer';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

/** A `KromaClient` over a fetch that records every request and answers with
 * whatever `reply` returns. Responses are schema-parsed, so a test that only
 * cares about the REQUEST lets the parse fail and reads the recorded call. */
export function recordingClient(
  reply?: (url: string, init?: RequestInit) => Reply,
  options?: { authToken?: string; locale?: string; userAgent?: string },
) {
  const calls: RecordedCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    calls.push({
      method: init?.method ?? 'GET',
      url,
      path: url.startsWith(`${BASE}/api`) ? url.slice(`${BASE}/api`.length) : url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    });
    const r = reply?.(url, init) ?? {};
    const text = r.text ?? (r.json === undefined ? '' : JSON.stringify(r.json));
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      body: null,
      text: async () => text,
      json: async () => (text ? JSON.parse(text) : undefined),
      blob: async () => new Blob([text]),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  return { client: createKromaClient({ baseUrl: BASE, fetch, ...options }), calls, fetch };
}

/** Run `call` on a client holding {@link BEARER}, swallowing the response-schema
 * rejection a canned reply causes, and hand back the request it made. */
export async function recordRequest(
  call: (client: KromaClient) => unknown,
  reply?: (url: string, init?: RequestInit) => Reply,
): Promise<RecordedCall> {
  const { client, calls } = recordingClient(reply, { authToken: BEARER });
  await Promise.resolve(call(client)).catch(() => undefined);
  const first = calls[0];
  if (!first) throw new Error('no request was made');
  return first;
}

type PartialNamespace<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : PartialNamespace<T[K]>;
};

/** The namespaces a test chooses to implement, each as far as it needs to go. */
export type PartialClient = { [D in keyof Domains]?: PartialNamespace<Domains[D]> };

const unprovided = (path: string) => () => {
  throw new Error(`fakeClient: ${path} was called, and this test did not provide it`);
};

function stubbed(name: string, provided: object): object {
  return new Proxy(provided, {
    get(target, key) {
      if (typeof key !== 'string') return Reflect.get(target, key);
      const member: unknown = Reflect.get(target, key);
      if (member === undefined) return unprovided(`${name}.${key}`);
      if (typeof member === 'object' && member !== null) return stubbed(`${name}.${key}`, member);
      return member;
    },
  });
}

/** A client for a test that exercises part of one: the namespaces given are used
 * as they are, and reaching for anything else throws by name. Whole, so it needs
 * no cast at the call site. */
export function fakeClient(parts: PartialClient = {}): KromaClient {
  const namespaces = Object.fromEntries(
    Object.keys(domains).map((name) => [
      name,
      stubbed(name, (parts as Record<string, object | undefined>)[name] ?? {}),
    ]),
  );
  const controls: ClientControls = {
    baseUrl: BASE,
    setAuthToken: () => undefined,
    setRefreshHandler: () => undefined,
    refreshSession: async () => undefined,
    setLocale: () => undefined,
    hasAuth: false,
    sessionToken: undefined,
    authHeaders: () => ({}),
  };
  return Object.assign(namespaces as unknown as Domains, controls);
}
