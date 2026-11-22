import { expect, it } from 'vitest';
import { Import, ImportFolderList } from './schemas';

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

it('reads a report saved before libraries could be refused as refusing none', () => {
  const parsed = Import.parse(wire);

  expect(parsed.report.refusedLibraries).toEqual([]);
});

it('reads a refused library with the library of this server that holds its files', () => {
  const refused = { name: 'Films', sharesFilesWith: 'Films 4K' };

  const parsed = Import.parse({ ...wire, report: { ...wire.report, refusedLibraries: [refused] } });

  expect(parsed.report.refusedLibraries).toEqual([refused]);
});

it('reads a failure for a reason it does not know as internal', () => {
  const parsed = Import.parse({ ...wire, status: 'failed', failure: { reason: 'somethingNew' } });

  expect(parsed.failure?.reason).toBe('internal');
});

it('reads a folder the server did not find as one with no place here', () => {
  const parsed = ImportFolderList.parse({
    folders: [{ folder: '/data/films', here: '/volume1/films' }, { folder: '/data/shows' }],
  });

  expect(parsed.folders.map((folder) => folder.here)).toEqual(['/volume1/films', undefined]);
});
