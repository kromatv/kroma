import { compareRaw, floorOf, parse } from '@kromatv/registry';

/** What a module needs from the server, as its manifest declares it. */
export interface Floored {
  id: string;
  engines?: Record<string, string> | null;
}

/**
 * Why no server could run `module`, when its server floor is past `release`, the
 * release being prepared (the server's own version in this repository, else the
 * SDK's). `null` when a server built from `release` would accept it, or when
 * either version is one this cannot order.
 */
export function floorBeyondRelease(module: Floored, release: string): string | null {
  const range = module.engines?.server;
  const floor = range ? floorOf(range) : null;
  if (!floor || !parse(release) || release === '0.0.0') return null;
  if (compareRaw(floor, release) <= 0) return null;
  return `${module.id}: needs server ${floor}, past ${release}, the release being prepared, so no server could run it`;
}
