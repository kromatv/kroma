import { z } from 'zod';
import type { LanSocket } from './reach';

const FrameText = z.string().transform((text, ctx) => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue('not JSON');
    return z.NEVER;
  }
});

/** What a frame said, or `null` when it is not JSON. */
export function parsed(text: string): unknown {
  return FrameText.safeParse(text).data ?? null;
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
