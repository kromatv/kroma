import { expect, it } from 'vitest';
import { columnPosters, wallSize } from './poster-wall.component';

it('shows nothing in a column when there is no poster at all', () => {
  expect(columnPosters([], 0, 8)).toEqual([]);
});

it('fills a column from a short list by going round it again', () => {
  const column = columnPosters(['a', 'b', 'c'], 0, 8);

  expect(column).toHaveLength(5);
  expect(new Set(column)).toEqual(new Set(['a', 'b', 'c']));
});

it('starts each column on its own poster, so neighbours differ', () => {
  const posters = Array.from({ length: 40 }, (_, n) => `p${n}`);

  expect(columnPosters(posters, 0, 8)[0]).toBe('p0');
  expect(columnPosters(posters, 1, 8)[0]).toBe('p1');
  expect(columnPosters(posters, 0, 8)[1]).toBe('p8');
});

it('repeats no poster across the wall when it is given a wall of them', () => {
  const posters = Array.from({ length: wallSize(8) }, (_, n) => `p${n}`);

  const shown = Array.from({ length: 8 }, (_, column) => columnPosters(posters, column, 8)).flat();

  expect(new Set(shown).size).toBe(wallSize(8));
});
