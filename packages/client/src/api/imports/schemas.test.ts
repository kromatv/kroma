import { expect, it } from 'vitest';
import { Import } from './schemas';

const tally = { read: 3, brought: 2, unmatched: 1 };

const wire = {
  id: 'i-1',
  importer: 'tv.x.import',
  server: { id: 'srv', name: 'Home' },
  status: 'running',
  createdAt: 1,
  report: { libraries: tally, users: tally, titles: tally, states: tally, plays: tally },
  unmatchedTitles: 1,
};

it('reads an import that runs, with its counts by kind', () => {
  const parsed = Import.parse(wire);

  expect(parsed.status).toBe('running');
  expect(parsed.report.titles).toEqual(tally);
});

it('reads a kind the server did not count as zero', () => {
  const parsed = Import.parse({ ...wire, report: { ...wire.report, plays: {} } });

  expect(parsed.report.plays).toEqual({ read: 0, brought: 0, unmatched: 0 });
});

it('reads a failure for a reason it does not know as internal', () => {
  const parsed = Import.parse({ ...wire, status: 'failed', failure: { reason: 'somethingNew' } });

  expect(parsed.failure?.reason).toBe('internal');
});
