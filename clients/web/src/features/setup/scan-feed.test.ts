import { expect, it } from 'vitest';
import { arrivals, ownFirst, scanCounts } from './scan-feed';

const matched = (id: string) => ({ id, poster: `/p/${id}`, matched: true });
const unmatched = (id: string) => ({ ...matched(id), matched: false });

it('reads an empty library as a scan still reading the folders', () => {
  expect(scanCounts([], { walking: false })).toEqual({ found: 0, matched: 0, phase: 'reading' });
});

it('keeps reading while the server walks, whatever it found so far', () => {
  expect(scanCounts([matched('a')], { walking: true }).phase).toBe('reading');
});

it('says matching while a title found has no poster yet', () => {
  const counts = scanCounts([matched('a'), unmatched('b')], { walking: false });

  expect(counts).toEqual({ found: 2, matched: 1, phase: 'matching' });
});

it('says ready once every title found is matched', () => {
  expect(scanCounts([matched('a'), matched('b')], { walking: false }).phase).toBe('ready');
});

it('puts a poster that just arrived in front of the ones already seen', () => {
  const seen = arrivals([], [matched('a')]);

  const next = arrivals(seen, [matched('a'), matched('b'), unmatched('c')]);

  expect(next).toEqual(['/p/b', '/p/a']);
});

it('drops a poster whose title left the library', () => {
  expect(arrivals(['/p/a', '/p/b'], [matched('b')])).toEqual(['/p/b']);
});

it('gives the library the first slots of a wall and leaves the others as they were', () => {
  const fill = ['/t/0', '/t/1', '/t/2', '/t/3'];

  const before = ownFirst(['/p/a'], fill, 4);
  const after = ownFirst(['/p/b', '/p/a'], fill, 4);

  expect(before).toEqual(['/p/a', '/t/1', '/t/2', '/t/3']);
  expect(after).toEqual(['/p/a', '/p/b', '/t/2', '/t/3']);
});

it('shows an empty wall when there is nothing to put on it', () => {
  expect(ownFirst([], [], 4)).toEqual([]);
});
