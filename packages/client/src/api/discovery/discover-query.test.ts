import { describe, expect, it } from 'vitest';
import { queryString } from '../../core/http';
import { discoverQuery } from './client';

describe('discoverQuery', () => {
  it('asks for nothing when nothing narrows the listing', () => {
    expect(queryString(discoverQuery())).toBe('');
    expect(queryString(discoverQuery({}))).toBe('');
  });

  it('reads "all" as the absence of a type filter', () => {
    expect(queryString(discoverQuery({ type: 'all' }))).toBe('');
    expect(queryString(discoverQuery({ type: 'tv' }))).toBe('?type=tv');
  });

  it('reads page one as the absence of a page', () => {
    expect(queryString(discoverQuery({ page: 1 }))).toBe('');
    expect(queryString(discoverQuery({ page: 3 }))).toBe('?page=3');
  });
});
