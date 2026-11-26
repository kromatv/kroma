import { ProgressEntry } from '@kromatv/client/media';
import { describe, expect, it } from 'vitest';
import { resumeSeconds } from './resume';

const TWO_HOURS = 7_200_000;

function saved(
  positionMs: number,
  extra: { resumable?: boolean; durationMs?: number | null } = {},
) {
  return ProgressEntry.parse({
    itemId: 'itm-1',
    positionMs,
    durationMs: TWO_HOURS,
    updatedAt: '2026-11-26T08:00:00.000Z',
    ...extra,
  });
}

describe('where playback of a title starts', () => {
  it('picks up at the saved position when the server says it resumes', () => {
    expect(resumeSeconds(saved(600_000, { resumable: true }))).toBe(600);
  });

  it('starts over when the server says it does not, wherever it was left', () => {
    expect(resumeSeconds(saved(600_000, { resumable: false }))).toBe(0);
  });

  it('starts over with nothing saved', () => {
    expect(resumeSeconds(null)).toBe(0);
  });

  it.each([
    [10_000, 0],
    [600_000, 600],
    [6_900_000, 0],
  ])('judges %i ms by the former rule on a server too old to say', (positionMs, seconds) => {
    expect(resumeSeconds(saved(positionMs))).toBe(seconds);
  });

  it('borrows the runtime it is given when an old entry carries no duration', () => {
    const entry = saved(6_900_000, { durationMs: null });

    expect(resumeSeconds(entry)).toBe(6_900);
    expect(resumeSeconds(entry, TWO_HOURS)).toBe(0);
  });
});
