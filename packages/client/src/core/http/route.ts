/**
 * Where a client's requests go: `canonical`, the base it was configured with,
 * or a direct route to the same server that `connectDirect` in `@kromatv/core`
 * proved. `canonical` also names the server (a cache key, a stored session),
 * whichever base is in use. `media()` is the base a player or an image is
 * handed, and follows the direct route only under `directMedia`.
 * `directSignal()` aborts when the route in use is dropped, so a request still
 * waiting on it can go to `canonical` instead. `drop(base)` leaves the route
 * only while `base` is still the one in use, so a request that failed on a
 * route already replaced cannot drop its successor.
 */
export interface Route {
  readonly canonical: string;
  api(): string;
  media(): string;
  direct(): string | undefined;
  directSignal(): AbortSignal | undefined;
  useDirect(base: string): void;
  drop(base?: string): void;
  subscribe(listener: (direct: string | undefined) => void): () => void;
}

export interface RouteOptions {
  directMedia?: boolean;
}

/** A route starting on `canonical`. Under `directMedia` (default off), media
 * URLs follow the direct route; off, they keep `canonical`, because an https
 * page cannot hand an `http://` URL to an `<img>` or a `<video>`. */
export function createRoute(canonical: string, options: RouteOptions = {}): Route {
  let current: { base: string; abort: AbortController } | undefined;
  const listeners = new Set<(direct: string | undefined) => void>();
  const announce = () => {
    for (const listener of listeners) listener(current?.base);
  };

  return {
    canonical,
    api: () => current?.base ?? canonical,
    media: () => (options.directMedia ? (current?.base ?? canonical) : canonical),
    direct: () => current?.base,
    directSignal: () => current?.abort.signal,
    useDirect(base) {
      if (current?.base === base) return;
      current?.abort.abort();
      current = { base, abort: new AbortController() };
      announce();
    },
    drop(base) {
      if (!current || (base !== undefined && current.base !== base)) return;
      current.abort.abort();
      current = undefined;
      announce();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// RFC 9110 §9.2.2: a request that may have reached the server before its answer
// was lost is sent twice only when sending it twice changes nothing.
const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/** Send one request on the route's current base. On the direct route, a request
 * that fails before an answer (fetch rejects), or is still waiting when the
 * route is dropped, drops the route and, when it is idempotent, goes once more
 * to the canonical base. A request the caller aborted is never sent again. */
export async function sendOnRoute(
  route: Route,
  request: { method: string; signal?: AbortSignal | null },
  send: (base: string, signal: AbortSignal | undefined) => Promise<Response>,
): Promise<Response> {
  const caller = request.signal ?? undefined;
  const base = route.api();
  const dropped = route.directSignal();
  if (base === route.canonical || !dropped) return send(base, caller);
  const both = linked(caller, dropped);
  try {
    return await send(base, both.signal);
  } catch (error) {
    if (caller?.aborted) throw error;
    route.drop(base);
    if (!IDEMPOTENT.has(request.method.toUpperCase())) throw error;
    return send(route.canonical, caller);
  } finally {
    both.settle();
  }
}

function linked(caller: AbortSignal | undefined, dropped: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (caller?.aborted || dropped.aborted) abort();
  caller?.addEventListener('abort', abort, { once: true });
  dropped.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    settle: () => dropped.removeEventListener('abort', abort),
  };
}
