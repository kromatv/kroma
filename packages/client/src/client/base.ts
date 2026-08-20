// Request/URL/error plumbing shared by every KromaClient domain module.

import { ApiErrorBody } from '../schemas';

/** Header set for every JSON-bodied request; `sendApiRequest` adds auth and
 * locale itself but never a content type. */
export const JSON_HEADERS = { 'content-type': 'application/json' };

export interface KromaClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  authToken?: string;
  locale?: string;
  userAgent?: string;
}

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

export class KromaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'KromaApiError';
  }
}

/** The server's error payload behind a thrown request error, validated. Empty
 * for anything that is not a {@link KromaApiError} and for a body the server
 * did not shape (so a caller reads a flag without ever casting). */
export function apiErrorBody(e: unknown): ApiErrorBody {
  if (!(e instanceof KromaApiError)) return {};
  const parsed = ApiErrorBody.safeParse(e.body);
  return parsed.success ? parsed.data : {};
}

/** The human-facing message for a thrown request error: the server's `{ error }`
 * text when present (far more useful than the generic "GET … failed (400)"),
 * otherwise the provided localized `fallback`. */
export function apiErrorText(e: unknown, fallback: string): string {
  return apiErrorBody(e).error?.trim() || fallback;
}

// ~2 KB of JSON per title on the unpaginated `/api/items` catalogue, so 64 MiB is 30k+ titles.
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

async function readBoundedJson(res: Response, path: string): Promise<unknown> {
  const text = await readBoundedText(res, path);
  return text ? JSON.parse(text) : undefined;
}

/** The request plumbing a domain module needs: the resolved server origin, the
 * raw fetch (for non-JSON endpoints like logs) and the authed JSON helper. */
export interface RequestContext {
  readonly baseUrl: string;
  readonly fetchFn: typeof globalThis.fetch;
  json<T>(path: string, init?: RequestInit): Promise<T>;
  blob(path: string, init?: RequestInit): Promise<Blob>;
}

/** Shared request core: attach the auth/locale headers, hit `${baseUrl}/api${path}`,
 * and throw {@link KromaApiError} (with the parsed JSON error body) on a non-2xx
 * response. Returns the raw `Response` so callers read it as JSON or a `Blob`. */
async function sendApiRequest(
  fetchFn: typeof globalThis.fetch,
  baseUrl: string,
  authToken: string | undefined,
  locale: string | undefined,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  if (locale) headers.set('Accept-Language', locale);
  const res = await fetchFn(`${baseUrl}/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await readBoundedJson(res, path).catch(() => undefined);
    throw new KromaApiError(
      res.status,
      `${init?.method ?? 'GET'} ${path} failed (${res.status})`,
      body,
    );
  }
  return res;
}

/** Authed `GET/POST/…` against `${baseUrl}/api${path}`, parsing the JSON body
 * (or `undefined` when the response carries none). Throws {@link KromaApiError}
 * with the parsed error body on a non-2xx response. */
export async function requestJson<T>(
  fetchFn: typeof globalThis.fetch,
  baseUrl: string,
  authToken: string | undefined,
  locale: string | undefined,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await sendApiRequest(fetchFn, baseUrl, authToken, locale, path, init);
  // An empty 2xx (204/205 by spec, and a bare 202 ack) is not a parse failure:
  // read the body as text and parse only when there is something there.
  if (res.status === 204 || res.status === 205) return undefined as T;
  return (await readBoundedJson(res, path)) as T;
}

/** Like {@link requestJson} but returns the raw body as a `Blob` for file
 * downloads (e.g. the admin backup export). Throws {@link KromaApiError} on a
 * non-2xx response, attaching the parsed JSON error body when present. */
export async function requestBlob(
  fetchFn: typeof globalThis.fetch,
  baseUrl: string,
  authToken: string | undefined,
  locale: string | undefined,
  path: string,
  init?: RequestInit,
): Promise<Blob> {
  const res = await sendApiRequest(fetchFn, baseUrl, authToken, locale, path, init);
  return res.blob();
}

export function libraryQuery(libraryId?: string): string {
  return libraryId ? `?library=${encodeURIComponent(libraryId)}` : '';
}

/** Add a `<link rel="preconnect">` to the server origin (no-op off-DOM / if dup). */
export function preconnect(baseUrl: string): void {
  if (typeof document === 'undefined') return;
  try {
    const origin = new URL(baseUrl).origin;
    if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  } catch {
    /* invalid URL or no DOM ignore */
  }
}
