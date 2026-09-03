import type { z } from 'zod';
import type { RequestContext } from '../../core/http';
import type { ModuleId } from './ids';

/** The request surface a module gets for its own admin routes. Paths are
 *  relative to the module's mount: `get('/clients', Clients)` reads
 *  `/api/admin/m/<id>/clients` and parses it.
 *
 *  A module owns the shape of its own API and ships on its own tag, so the core
 *  cannot hold its schemas: the module passes them in, and the parse happens at
 *  the same boundary and with the same errors as every core call. */
export interface ModuleApi {
  get<S extends z.ZodType>(path: string, response: S): Promise<z.output<S>>;
  post<S extends z.ZodType>(path: string, body: unknown, response: S): Promise<z.output<S>>;
  post(path: string, body?: unknown): Promise<void>;
  put<S extends z.ZodType>(path: string, body: unknown, response: S): Promise<z.output<S>>;
  put(path: string, body?: unknown): Promise<void>;
  delete<S extends z.ZodType>(path: string, response: S): Promise<z.output<S>>;
  delete(path: string): Promise<void>;
  /** Raw bytes rather than JSON, for a file a module accepts directly. */
  upload<S extends z.ZodType>(
    path: string,
    file: Blob,
    response: S,
    headers?: Record<string, string>,
  ): Promise<z.output<S>>;
}

/** Bind `ctx` to the admin mount of module `id`. */
export function moduleApi(ctx: RequestContext, id: ModuleId): ModuleApi {
  const at = (path: string) => `/admin/m/${encodeURIComponent(id)}${path}`;
  const send = (verb: 'post' | 'put') => (path: string, body?: unknown, response?: z.ZodType) =>
    response ? ctx[verb](at(path), response, { body }) : ctx[verb](at(path), { body });
  return {
    get: (path, response) => ctx.get(at(path), response),
    post: send('post') as ModuleApi['post'],
    put: send('put') as ModuleApi['put'],
    delete: ((path: string, response?: z.ZodType) =>
      response ? ctx.delete(at(path), response) : ctx.delete(at(path))) as ModuleApi['delete'],
    upload: (path, file, response, headers) => ctx.upload(at(path), file, response, { headers }),
  };
}
