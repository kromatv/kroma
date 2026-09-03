import { z } from 'zod';
import { KromaApiError, KromaSchemaError } from './api-error';
import { readBoundedJson } from './body';
import { type Concurrency, concurrencyGate } from './concurrency';
import { buildPath, type PathParam, type PathParams } from './path';
import { type Query, queryString } from './query';

export interface KromaClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  authToken?: string;
  locale?: string;
  userAgent?: string;
}

type ResponseSchema = z.ZodType;

/** What a request carries beyond its path and its response schema: the query,
 * the JSON body, and a `RequestInit` for the rare caller that needs an
 * `AbortSignal` or a one-off header. */
export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Extra request headers. A header whose value is undefined is not sent, so a
   * caller passes what it has without building the object conditionally. */
  headers?: Readonly<Record<string, string | undefined>>;
  /** Abort this request. Under `concurrency: 'share'` it is ignored: a shared
   * request belongs to every caller waiting on it, and one walking away must not
   * cancel it for the others. */
  signal?: AbortSignal;
  /** What to do when the same request is already in flight. Omitted, requests are
   * independent. `share` hands the in-flight promise to an identical call, which
   * is what a catalogue read wants. `latest` aborts the previous call under the
   * same key before starting this one, which is what a typeahead wants. */
  concurrency?: Concurrency;
  /** How this endpoint is authenticated. `bearer` (the default, so a forgotten
   * flag fails safe) attaches the session token and spends one silent refresh on
   * a 401. `public` sends no `Authorization` at all and never refreshes: it is
   * what a pre-auth handshake needs, and it is why the token exchange cannot
   * recurse. */
  auth?: AuthMode;
}

export type AuthMode = 'public' | 'bearer';

/** `params` is required exactly when the path template declares one, and its
 * keys are exactly the names the template spells. */
export type PathArgs<P extends string> = [PathParam<P>] extends [never]
  ? [options?: RequestOptions]
  : [options: RequestOptions & { params: PathParams<P> }];

interface Verb {
  <const P extends string, S extends ResponseSchema>(
    path: P,
    response: S,
    ...args: PathArgs<P>
  ): Promise<z.output<S>>;
  <const P extends string>(path: P, ...args: PathArgs<P>): Promise<void>;
}

/** The one way a domain module reaches the server. A path is a template whose
 * parameters the compiler reads off it; a response is a zod schema, and its
 * output type is what the caller gets, so a body the server did not shape never
 * reaches a caller as a lie. */
export interface RequestContext {
  readonly baseUrl: string;
  /** The absolute URL, for what fetches itself: a `<video>` src, an `<img>`, the
   * native downloader, a link the user opens. */
  url<const P extends string>(path: P, ...args: PathArgs<P>): string;
  get: Verb;
  post: Verb;
  put: Verb;
  patch: Verb;
  delete: Verb;
  /** Send raw bytes (an avatar, a backup archive) rather than JSON. */
  upload: {
    <const P extends string, S extends ResponseSchema>(
      path: P,
      file: Blob,
      response: S,
      ...args: PathArgs<P>
    ): Promise<z.output<S>>;
    <const P extends string>(path: P, file: Blob, ...args: PathArgs<P>): Promise<void>;
  };
  /** Raw bytes back, for a file download. */
  blob<const P extends string>(path: P, ...args: PathArgs<P>): Promise<Blob>;
  /** A `text/plain` endpoint (the server log tail). */
  text<const P extends string>(path: P, ...args: PathArgs<P>): Promise<string>;
  /** The response itself, for the few endpoints whose STATUS is the answer (a
   * storyboard still being generated answers 202). Never throws on a non-2xx. */
  send<const P extends string>(path: P, ...args: PathArgs<P>): Promise<Response>;
  /** An absolute URL outside this server (a TMDB poster), unauthed. */
  external(url: string): Promise<Response>;
}

export interface TransportConfig {
  baseUrl: string;
  fetchFn: typeof globalThis.fetch;
  token(): string | undefined;
  locale(): string | undefined;
  /** Mint a fresh bearer after a 401, or resolve undefined to give up. */
  refresh(): Promise<string | undefined>;
  /** Aborts every request this context makes unless the call named its own.
   * A query adapter builds one context per fetch and hands it the runner's
   * signal, so an endpoint needs no signal parameter of its own. */
  signal?: AbortSignal;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/** Wrap `fetchFn` so every request it makes carries `ua`. */
export function withUserAgent(
  fetchFn: typeof globalThis.fetch,
  ua: string,
): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('User-Agent', ua);
    return fetchFn(input, { ...init, headers });
  };
}

type AnyOptions = RequestOptions & { params?: Record<string, string | number> };

function headersOf(options?: AnyOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(options?.headers ?? {})) {
    if (value !== undefined) out[name] = value;
  }
  return out;
}

const isSchema = (value: unknown): value is ResponseSchema =>
  typeof value === 'object' && value !== null && '_zod' in value;

function split(rest: readonly unknown[]) {
  const [first, second] = rest;
  return isSchema(first)
    ? { response: first, options: second as AnyOptions | undefined }
    : { response: undefined, options: first as AnyOptions | undefined };
}

/** The shared transport: path templates, auth and locale headers, the 64 MiB
 * body bound, one silent refresh per 401, and a zod parse of every JSON answer. */
export function createRequestContext(config: TransportConfig): RequestContext {
  const { baseUrl, fetchFn } = config;
  const underPolicy = concurrencyGate();
  const resolve = (template: string, options?: AnyOptions) =>
    `${buildPath(template, options?.params)}${queryString(options?.query)}`;

  const fetchPath = (path: string, init?: RequestInit, auth: AuthMode = 'bearer') => {
    const headers = new Headers(init?.headers);
    const token = auth === 'public' ? undefined : config.token();
    const locale = config.locale();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (locale) headers.set('Accept-Language', locale);
    return fetchFn(`${baseUrl}/api${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? config.signal,
    });
  };

  async function checked(
    path: string,
    init?: RequestInit,
    auth: AuthMode = 'bearer',
    retried = false,
  ): Promise<Response> {
    const res = await fetchPath(path, init, auth);
    if (res.ok) return res;
    if (res.status === 401 && !retried && auth !== 'public') {
      if (await config.refresh()) return checked(path, init, auth, true);
    }
    const body = await readBoundedJson(res, path).catch(() => undefined);
    throw new KromaApiError(
      res.status,
      `${init?.method ?? 'GET'} ${path} failed (${res.status})`,
      body,
    );
  }

  async function decode(
    path: string,
    schema: ResponseSchema | undefined,
    init?: RequestInit,
    auth?: AuthMode,
  ) {
    const res = await checked(path, init, auth);
    if (!schema) return undefined;
    const parsed = z.safeParse(schema, await readBoundedJson(res, path));
    if (!parsed.success) throw new KromaSchemaError(path, parsed.error.issues);
    return parsed.data;
  }

  const verb = (method: string) =>
    ((path: string, ...rest: unknown[]) => {
      const { response, options } = split(rest);
      const target = resolve(path, options);
      const body =
        options?.body === undefined
          ? { headers: headersOf(options) }
          : {
              headers: { ...JSON_HEADERS, ...headersOf(options) },
              body: JSON.stringify(options.body),
            };
      return underPolicy(`${method} ${target}`, options, (signal) =>
        decode(target, response, { method, ...body, signal }, options?.auth),
      );
    }) as RequestContext['post'];

  return {
    baseUrl,
    url: (template, ...args) => `${baseUrl}/api${resolve(template, args[0])}`,
    get: ((path: string, ...rest: unknown[]) => {
      const { response, options } = split(rest);
      const target = resolve(path, options);
      return underPolicy(`GET ${target}`, options, (signal) =>
        decode(target, response, { headers: headersOf(options), signal }, options?.auth),
      );
    }) as RequestContext['get'],
    post: verb('POST'),
    put: verb('PUT'),
    patch: verb('PATCH'),
    delete: verb('DELETE'),
    upload: ((path: string, file: Blob, ...rest: unknown[]) => {
      const { response, options } = split(rest);
      return decode(
        resolve(path, options),
        response,
        {
          method: 'POST',
          headers: {
            'content-type': file.type || 'application/octet-stream',
            ...headersOf(options),
          },
          body: file,
          signal: options?.signal,
        },
        options?.auth,
      );
    }) as RequestContext['upload'],
    blob: async (template, ...args) =>
      (
        await checked(
          resolve(template, args[0]),
          { headers: headersOf(args[0]), signal: args[0]?.signal },
          args[0]?.auth,
        )
      ).blob(),
    text: async (template, ...args) =>
      (
        await checked(
          resolve(template, args[0]),
          { headers: headersOf(args[0]), signal: args[0]?.signal },
          args[0]?.auth,
        )
      ).text(),
    send: (template, ...args) =>
      fetchPath(
        resolve(template, args[0]),
        { headers: headersOf(args[0]), signal: args[0]?.signal },
        args[0]?.auth,
      ),
    external: (absolute) => fetchFn(absolute),
  };
}
