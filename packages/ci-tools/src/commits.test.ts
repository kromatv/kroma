import { describe, expect, it } from 'vitest';
import { parseCommit } from './commits';

describe('parseCommit', () => {
  it('reads the type, scope, text and pull request of a squash title', () => {
    expect(parseCommit('abc', 'fix(indexer): an empty search reaches the indexer (#317)')).toEqual({
      sha: 'abc',
      type: 'fix',
      scope: 'indexer',
      text: 'an empty search reaches the indexer',
      pr: 317,
      breaking: false,
    });
  });

  it('reads a subject with no scope and no pull request', () => {
    expect(parseCommit('abc', 'feat: monitored titles')).toMatchObject({
      scope: null,
      pr: null,
    });
  });

  it('marks a bang or a breaking footer as breaking', () => {
    expect(parseCommit('a', 'feat(api)!: ids are strings')?.breaking).toBe(true);
    expect(
      parseCommit('a', 'feat: ids', 'text\n\nBREAKING CHANGE: ids are strings')?.breaking,
    ).toBe(true);
  });

  it('refuses a subject that is not conventional', () => {
    expect(parseCommit('a', 'Merge branch main')).toBeNull();
    expect(parseCommit('a', 'Fix: capitalised type')).toBeNull();
  });
});
