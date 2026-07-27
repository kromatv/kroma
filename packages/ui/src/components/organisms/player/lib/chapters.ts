import type { Chapter } from '../types';

/**
 * The chapter model behind the progress bar (§1). Real chapter data (embedded
 * MKV/MP4 chapters, exposed by the server when available) is passed straight
 * through, normalized. When an item has NO chapters the bar degrades gracefully
 * to a single continuous segment (the returned array is empty and the bar draws
 * one fill) intro/credits markers are always drawn as coloured ticks on top,
 * independent of chapters.
 */

/**
 * Sort, clamp and gap-fill raw chapter data into a clean, contiguous list.
 * Returns `[]` when there is nothing meaningful to segment (0/1 chapters), so
 * the bar renders as a plain progress bar.
 */
export function normalizeChapters(
  raw: readonly Chapter[] | null | undefined,
  durMs: number,
): Chapter[] {
  if (!raw || raw.length < 2 || durMs <= 0) return [];
  const sorted = raw
    .filter((c) => Number.isFinite(c.startMs) && c.startMs < durMs)
    .map((c) => ({ ...c, startMs: Math.max(0, Math.min(c.startMs, durMs)) }))
    .sort((a, b) => a.startMs - b.startMs);
  if (sorted.length < 2) return [];
  // Make each chapter end where the next begins (and the last at the runtime).
  return sorted.map((c, i) => {
    const next = sorted[i + 1];
    return { ...c, endMs: next ? next.startMs : durMs, kind: c.kind ?? 'chapter' };
  });
}

/** Index of the chapter containing `posMs`, or -1 when there are no chapters. */
export function currentChapterIndex(chapters: readonly Chapter[], posMs: number): number {
  if (chapters.length === 0) return -1;
  for (let i = chapters.length - 1; i >= 0; i -= 1) {
    const ch = chapters[i];
    if (ch && posMs >= ch.startMs) return i;
  }
  return 0;
}

/** Convenience: the chapter object at `posMs`, or null. */
export function currentChapter(chapters: readonly Chapter[], posMs: number): Chapter | null {
  const i = currentChapterIndex(chapters, posMs);
  return i >= 0 ? (chapters[i] ?? null) : null;
}
