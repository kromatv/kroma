// A module's own slice of the admin API. Every module is mounted at
// `/api/admin/m/<id>`, derived from its id, so a module addresses its sidecar by
// path relative to that mount and can neither reach nor be shadowed by another.

import { JSON_HEADERS, type RequestContext } from './base';

/** The request surface a module gets for its own admin routes. Paths are
 *  relative to the module's mount: `get('/clients')` reads
 *  `/api/admin/m/<id>/clients`. */
export interface ModuleApi {
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

const send = <T>(ctx: RequestContext, base: string, path: string, init?: RequestInit): Promise<T> =>
  ctx.json<T>(`${base}${path}`, init);

const withBody = (method: string, body?: unknown): RequestInit =>
  body === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(body) };

/** Bind `ctx` to the admin mount of module `id`. */
export function moduleApi(ctx: RequestContext, id: string): ModuleApi {
  const base = `/admin/m/${encodeURIComponent(id)}`;
  return {
    get: (path, init) => send(ctx, base, path, init),
    post: (path, body) => send(ctx, base, path, withBody('POST', body)),
    put: (path, body) => send(ctx, base, path, withBody('PUT', body)),
    delete: (path) => send(ctx, base, path, { method: 'DELETE' }),
  };
}
