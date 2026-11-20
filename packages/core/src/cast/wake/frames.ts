import type { LanSocket } from './reach';

/** What a frame said, or `null` when it is not JSON. */
export function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Read frames until `pick` takes one, and answer what it took. Each frame is
 * waited for `withinMs`; a frame `pick` answers `undefined` for is read past.
 * Rejects as the socket does, and as `pick` does. */
export async function awaited<T>(
  socket: LanSocket,
  withinMs: number,
  pick: (frame: unknown) => T | undefined,
): Promise<T> {
  return pick(parsed(await socket.next(withinMs))) ?? awaited(socket, withinMs, pick);
}
