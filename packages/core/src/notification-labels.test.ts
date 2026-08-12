import type { Notification } from '@kroma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  groupNotificationRepeats,
  groupNotificationsByDay,
  NOTIFICATION_CATEGORY_LABEL,
  NOTIFICATION_DAY_LABEL,
  notificationDayOf,
  notificationRepeatKey,
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

function said(
  id: string,
  words: { event?: string; title?: string; body?: string; read?: boolean },
): Notification {
  return { ...row(0, id), event: 'system.job.failed', title: 'Failed', ...words } as Notification;
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

describe('folding a repeated event', () => {
  it('collapses rows that say exactly the same thing into one entry', () => {
    const runs = groupNotificationRepeats([
      said('a', { body: 'The task Import failed.' }),
      said('b', { body: 'The task Import failed.' }),
      said('c', { body: 'The task Import failed.' }),
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(runs[0]?.head.id).toBe('a');
    expect(runs[0]?.unread).toBe(3);
  });

  it('keeps rows apart when the event or the sentence differs', () => {
    const runs = groupNotificationRepeats([
      said('a', { body: 'The task Import failed.' }),
      said('b', { body: 'The task Scan failed.' }),
      said('c', { event: 'download.failed', body: 'The task Import failed.' }),
      said('d', { title: 'Storage almost full', body: 'The task Import failed.' }),
    ]);

    expect(runs.map((r) => r.items.map((i) => i.id))).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('anchors a run where its newest member sat, folding later ones up into it', () => {
    const runs = groupNotificationRepeats([
      said('a', { body: 'Import failed.' }),
      said('b', { body: 'Scan failed.' }),
      said('c', { body: 'Import failed.' }),
    ]);

    expect(runs.map((r) => r.head.id)).toEqual(['a', 'b']);
    expect(runs[0]?.items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('counts only the members still unread', () => {
    const runs = groupNotificationRepeats([
      said('a', { body: 'Import failed.', read: true }),
      said('b', { body: 'Import failed.' }),
      said('c', { body: 'Import failed.', read: true }),
    ]);

    expect(runs[0]?.unread).toBe(1);
    expect(runs[0]?.items).toHaveLength(3);
  });

  it('has nothing to fold when the inbox is empty', () => {
    expect(groupNotificationRepeats([])).toEqual([]);
  });

  it('reads the identity off the event and the words, not off the row id', () => {
    const one = said('a', { body: 'Import failed.' });
    const other = said('z', { body: 'Import failed.' });
    expect(notificationRepeatKey(one)).toBe(notificationRepeatKey(other));
    expect(notificationRepeatKey(said('a', { body: 'Scan failed.' }))).not.toBe(
      notificationRepeatKey(one),
    );
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
