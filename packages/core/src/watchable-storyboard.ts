import type { StoryboardManifest } from '@kromatv/client/media';
import type { WatchableStoryboard } from '@kromatv/client/watchable';

export const STORYBOARD_REFETCH_MS = 10_000;

type SheetGrid = Pick<StoryboardManifest, 'interval' | 'count'>;

export function storyboardAsksAgain(answer: WatchableStoryboard | 'pending' | null): boolean {
  if (answer === 'pending') return true;
  return answer !== null && !answer.complete;
}

export function storyboardTileIndex(sheet: SheetGrid, sec: number): number | null {
  if (sheet.count <= 0 || sheet.interval <= 0) return null;
  return Math.max(0, Math.min(sheet.count - 1, Math.floor(sec / sheet.interval)));
}

/** The tile a second falls on, where it is drawn. A sheet that marks its tiles
 * `ready` yields none for a tile marked `0`; a sheet that marks none is drawn
 * whole. */
export function drawnTileIndex(sheet: SheetGrid & { ready?: string }, sec: number): number | null {
  const index = storyboardTileIndex(sheet, sec);
  if (index === null || sheet.ready === undefined) return index;
  return sheet.ready[index] === '1' ? index : null;
}
