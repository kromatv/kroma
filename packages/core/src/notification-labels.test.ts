import type { Notification } from '@kroma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  groupNotificationsByDay,
  NOTIFICATION_CATEGORY_LABEL,
  NOTIFICATION_DAY_LABEL,
  notificationDayOf,
} from './notification-labels';

/** A row is only ever read here for its `createdAt`; the rest is shape. */
function row(createdAt: number, id = String(createdAt)): Notification {
  return {
    id,
    category: 'system',
    event: 'system.test',
    title: 'T',
    body: 'B',
    link: null,
    imageUrl: null,
    actions: [],
    read: false,
    createdAt,
  } as unknown as Notification;
}

/** Local-time helper: the grouping is about calendar days, so the tests have to
 * speak in them rather than in offsets from an epoch. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

afterEach(() => {
  vi.useRealTimers();
});

describe('which day a notification falls under', () => {
  const now = at(2026, 3, 15, 9, 30);

  it('calls anything from the current calendar day today', () => {
    expect(notificationDayOf(now, now)).toBe('today');
    // Same day, but before "now" by more than the elapsed hours: still today.
    expect(notificationDayOf(at(2026, 3, 15, 0, 1), now)).toBe('today');
  });

  it('calls the previous calendar day yesterday, however late in it', () => {
    // The case the whole helper exists for: 23:50 yesterday is ~10 hours ago,
    // which "now minus 24h" would have called today.
    expect(notificationDayOf(at(2026, 3, 14, 23, 50), now)).toBe('yesterday');
    expect(notificationDayOf(at(2026, 3, 14, 0, 5), now)).toBe('yesterday');
  });

  it('calls everything before that earlier', () => {
    expect(notificationDayOf(at(2026, 3, 13, 23, 59), now)).toBe('earlier');
    expect(notificationDayOf(at(2025, 12, 31), now)).toBe('earlier');
  });

  it('keeps yesterday meaning yesterday across a DST boundary', () => {
    // Europe/Zurich springs forward on 2026-03-29, so that day is 23 hours long.
    // Stepping back a calendar day is what keeps this right; "now minus 24h"
    // lands on the wrong side of the transition.
    const morningAfter = at(2026, 3, 30, 8, 0);
    expect(notificationDayOf(at(2026, 3, 29, 22, 0), morningAfter)).toBe('yesterday');
    expect(notificationDayOf(at(2026, 3, 28, 22, 0), morningAfter)).toBe('earlier');
  });
});

describe('grouping the inbox', () => {
  it('keeps the server order and runs consecutive same-day rows together', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 3, 15, 9, 30));

    const groups = groupNotificationsByDay([
      row(at(2026, 3, 15, 9, 0), 'a'),
      row(at(2026, 3, 15, 8, 0), 'b'),
      row(at(2026, 3, 14, 23, 50), 'c'),
      row(at(2026, 3, 1), 'd'),
    ]);

    expect(groups.map((g) => g.day)).toEqual(['today', 'yesterday', 'earlier']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(groups[1]?.items.map((i) => i.id)).toEqual(['c']);
    expect(groups[2]?.items.map((i) => i.id)).toEqual(['d']);
  });

  it('opens a second run rather than merging rows that are not adjacent', () => {
    // The list is never re-sorted underneath the reader, so a stray older row
    // between two newer ones splits the day instead of being folded back in.
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 3, 15, 9, 30));

    const groups = groupNotificationsByDay([
      row(at(2026, 3, 15, 9, 0), 'a'),
      row(at(2026, 3, 1), 'b'),
      row(at(2026, 3, 15, 8, 0), 'c'),
    ]);

    expect(groups.map((g) => g.day)).toEqual(['today', 'earlier', 'today']);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 1]);
  });

  it('has nothing to group when the inbox is empty', () => {
    expect(groupNotificationsByDay([])).toEqual([]);
  });
});

describe('the shared vocabulary', () => {
  it('names every preference bucket the server can send', () => {
    // Exhaustive by type; asserted here so a category added without its copy is
    // caught by a failing test as well as by the compiler.
    expect(Object.keys(NOTIFICATION_CATEGORY_LABEL).sort()).toEqual([
      'downloads',
      'media',
      'reports',
      'requests',
      'system',
    ]);
  });

  it('names every day heading the grouping can produce', () => {
    expect(Object.keys(NOTIFICATION_DAY_LABEL).sort()).toEqual(['earlier', 'today', 'yesterday']);
  });
});
