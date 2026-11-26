import { clippedTexts, type ReaderPage, settle, speaks } from './page-reader';
import type { Clip, Unread } from './report';

/** What a sweep found: the clipped texts, and the screens it could not read. */
export interface Sweep {
  clips: Clip[];
  unread: Unread[];
}

/** Where a screen was read: in which language, on which target, and which screen. */
export type Where = Pick<Clip, 'language' | 'target' | 'screen'>;

/** Nothing found yet. */
export const NOTHING: Sweep = { clips: [], unread: [] };

const NO_TEXT = '(no text found)';

/** What two sweeps found together. */
export function joined(a: Sweep, b: Sweep): Sweep {
  return { clips: [...a.clips, ...b.clips], unread: [...a.unread, ...b.unread] };
}

/** A screen the sweep could not read, for `reason`. */
export function unreadAt(where: Where, reason: unknown): Sweep {
  const text = reason instanceof Error ? reason.message.split('\n')[0] : String(reason);
  return { clips: [], unread: [{ ...where, reason: text ?? '' }] };
}

/** Reads the page once it speaks the language of `where` and holds still, and
 *  writes what it found to stderr. */
export async function readScreen(page: ReaderPage, where: Where): Promise<Sweep> {
  const other = await speaks(page, where.language);
  if (other !== null) {
    return unreadAt(where, `it stayed in "${other}"`);
  }
  await settle(page);
  const found = await clippedTexts(page);
  process.stderr.write(`  ${where.screen}: ${found.length} clipped\n`);
  const { language, target, screen } = where;
  const clips = found.map(({ text, clipped }) => ({
    language,
    target,
    screen,
    text: text ?? NO_TEXT,
    clipped,
  }));
  return { clips, unread: [] };
}
