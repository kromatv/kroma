import type { z } from 'zod';
import type { RequestContext } from '../../core/http';
import type { ModuleId } from './ids';

/** The request surface a module gets for its own admin routes. Paths are
 *  relative to the module's mount: `get('/clients', Clients)` reads
 *  `/api/admin/m/<id>/clients` and parses it. */
export interface ModuleApi {
  get<S extends z.ZodType>(path: string, response: S): Promise<z.output<S>>;
  post<S extends z.ZodType>(path: string, body: unknown, response: S): Promise<z.output<S>>;
  post(path: string, body?: unknown): Promise<void>;
  put<S extends z.ZodType>(path: string, body: unknown, response: S): Promise<z.output<S>>;
  put(path: string, body?: unknown): Promise<void>;
  delete<S extends z.ZodType>(path: string, response: S): Promise<z.output<S>>;
  delete(path: string): Promise<void>;
  upload<S extends z.ZodType>(
    path: string,
    file: Blob,
    response: S,
    headers?: Record<string, string>,
  ): Promise<z.output<S>>;
}

export function moduleApi(ctx: RequestContext, id: ModuleId): ModuleApi {
  const at = ctx.at(`/api/admin/m/${encodeURIComponent(id)}`);
  const send = (verb: 'post' | 'put') => (path: string, body?: unknown, response?: z.ZodType) =>
    response ? at[verb](path, response, { body }) : at[verb](path, { body });
  return {
    get: (path, response) => at.get(path, response),
    post: send('post') as ModuleApi['post'],
    put: send('put') as ModuleApi['put'],
    delete: ((path: string, response?: z.ZodType) =>
      response ? at.delete(path, response) : at.delete(path)) as ModuleApi['delete'],
    upload: (path, file, response, headers) => at.upload(path, file, response, { headers }),
  };
}
