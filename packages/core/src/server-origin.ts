// Which origin a typed server address actually means: the scheme and port a
// bare host could carry, and the one that answers.

import { probeFinalOrigin, stripTrailingSlash } from './health-probe';

export interface ResolvedOrigin {
  url: string;
  secure: boolean;
}

/** Resolves which scheme a typed address actually speaks: an address without
 * one is probed https first; an explicit scheme is honoured as typed. Null
 * means nothing answered, which is not the same as insecure. */
export async function resolveServerOrigin(
  address: string,
  opts: { fetch?: typeof globalThis.fetch; timeoutMs?: number; port?: number } = {},
): Promise<ResolvedOrigin | null> {
  const fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const typed = stripTrailingSlash(address.trim());
  if (!typed) return null;
  const timeoutMs = opts.timeoutMs ?? 2500;

  const candidates = originCandidates(typed, opts.port ?? 4040);
  // Probed concurrently but resolved by priority: the standard port must beat
  // the same host on 4040 even when 4040 answers first.
  const reached = await Promise.all(
    candidates.map((url) => probeFinalOrigin(fetchFn, url, timeoutMs)),
  );
  const winner = reached.find((origin) => origin !== null);
  return winner ? { url: winner, secure: winner.toLowerCase().startsWith('https://') } : null;
}
// Every origin a typed address could mean, best first. Only what is missing is
// guessed at: a typed scheme or port is never swapped.
function originCandidates(typed: string, defaultPort: number): string[] {
  const hasScheme = /^https?:\/\//i.test(typed);
  // Authority only: a port lives before the first slash, so a path like
  // `host/kroma` must not be mistaken for one.
  const authority = typed.replace(/^https?:\/\//i, '').split('/')[0] ?? '';
  const hasPort = /:\d+$/.test(authority);

  if (hasScheme) {
    // Without a port the standard one is meant first, but 4040 is where this
    // project's server actually lives.
    return hasPort ? [typed] : [typed, `${typed}:${defaultPort}`];
  }
  if (hasPort) return [`https://${typed}`, `http://${typed}`];
  return [
    `https://${typed}`,
    `http://${typed}`,
    `https://${typed}:${defaultPort}`,
    `http://${typed}:${defaultPort}`,
  ];
}
