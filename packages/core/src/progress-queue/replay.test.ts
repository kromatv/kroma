import type { ProgressEntry } from '@kromatv/client/media';
import { describe, expect, it } from 'vitest';
import type { PendingProgress } from './pending';
import { CLOCK_SKEW_MS, replayBackoffMs, shouldReplay } from './replay';

const CAPTURED_AT = Date.parse('2026-03-01T12:00:00.000Z');

function queued(over: Partial<PendingProgress> = {}): PendingProgress {
  return {
    serverUrl: 'https://kroma.test',
    userId: 'usr-1',
    itemId: 'itm-1',
    positionMs: 600_000,
    durationMs: 3_600_000,
    reachedEnd: false,
    capturedAt: CAPTURED_AT,
    attempts: 0,
    ...over,
  } as PendingProgress;
}

function onServer(updatedAt: string, positionMs = 10_000): ProgressEntry {
  return { itemId: 'itm-1', positionMs, durationMs: 3_600_000, updatedAt } as ProgressEntry;
}

function at(offsetMs: number): string {
  return new Date(CAPTURED_AT + offsetMs).toISOString();
}

describe('replaying a position the server never took', () => {
  it('sends it when the account has no position for the title', () => {
    expect(shouldReplay(queued(), null)).toBe(true);
  });

  it('sends it when the server has not moved since the position was read', () => {
    expect(shouldReplay(queued(), onServer(at(-3_600_000)))).toBe(true);
  });

  it('drops it when another device moved the title while this one was away', () => {
    expect(shouldReplay(queued(), onServer(at(CLOCK_SKEW_MS + 1_000)))).toBe(false);
  });

  it('reads a stamp inside the skew window as this device rather than another', () => {
    expect(shouldReplay(queued(), onServer(at(CLOCK_SKEW_MS - 1_000)))).toBe(true);
  });

  it('sends a playback that ran to the end whatever else moved the title', () => {
    const finished = queued({ reachedEnd: true, positionMs: 3_600_000 });

    expect(shouldReplay(finished, onServer(at(CLOCK_SKEW_MS + 86_400_000)))).toBe(true);
  });

  it('sends it rather than losing it when the server stamp cannot be read', () => {
    expect(shouldReplay(queued(), onServer('not a date'))).toBe(true);
  });
});

describe('how long a failed pass waits', () => {
  it('doubles from five seconds and stops at five minutes', () => {
    expect(replayBackoffMs(1)).toBe(5_000);
    expect(replayBackoffMs(2)).toBe(10_000);
    expect(replayBackoffMs(4)).toBe(40_000);
    expect(replayBackoffMs(99)).toBe(300_000);
  });

  it('waits the first delay for a pass that has not failed yet', () => {
    expect(replayBackoffMs(0)).toBe(5_000);
  });
});
