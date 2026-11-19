import { Import } from '@kromatv/client/imports';
import { expect, it } from 'vitest';
import { atWork, tallies } from './import-run';

const none = { read: 0, brought: 0, unmatched: 0 };

const found = (over: Record<string, unknown>) =>
  Import.parse({
    id: 'i-1',
    importer: 'tv.x.import',
    server: { id: 'srv', name: 'Home' },
    status: 'running',
    createdAt: 1,
    report: { libraries: none, users: none, titles: none, states: none, plays: none },
    unmatchedTitles: 0,
    ...over,
  });

it('asks again about an import that waits or runs, and about one it has not read yet', () => {
  expect(atWork(undefined)).toBe(true);
  expect(atWork('queued')).toBe(true);
  expect(atWork('running')).toBe(true);
});

it('stops asking about an import that ended, however it ended', () => {
  expect(atWork('completed')).toBe(false);
  expect(atWork('cancelled')).toBe(false);
  expect(atWork('failed')).toBe(false);
});

it('lists only the kinds the import read something of, in reading order', () => {
  const report = {
    libraries: { read: 2, brought: 2, unmatched: 0 },
    users: none,
    titles: { read: 84, brought: 80, unmatched: 4 },
    states: none,
    plays: none,
  };

  expect(tallies(found({ report })).map((row) => row.kind)).toEqual(['libraries', 'titles']);
  expect(tallies(undefined)).toEqual([]);
});
