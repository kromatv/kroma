import { describe, expect, it } from 'vitest';
import type { NamespaceSummary } from '#site/lib/views';
import { matchesNamespace, namespaceCounts, nextNamespace, workLeft } from './namespace-filter';

function namespace(file: string, over: Partial<NamespaceSummary['states']> = {}, drafts = 0) {
  const states = { missing: 0, translated: 4, outdated: 0, unreviewed: 0, ...over };
  const total = states.missing + states.translated + states.outdated + states.unreviewed;
  return {
    file,
    states,
    progress: { done: total - states.missing, total },
    drafts,
  } satisfies NamespaceSummary;
}

const nav = namespace('nav');
const player = namespace('player', { missing: 2 });
const admin = namespace('admin', { outdated: 1, unreviewed: 3 }, 2);

const shown = (filter: Parameters<typeof matchesNamespace>[1]) =>
  [nav, player, admin].filter((n) => matchesNamespace(n, filter)).map((n) => n.file);

describe('matchesNamespace', () => {
  it('lists each file under the filters its counts call for', () => {
    expect(shown('all')).toEqual(['nav', 'player', 'admin']);
    expect(shown('incomplete')).toEqual(['player']);
    expect(shown('outdated')).toEqual(['admin']);
    expect(shown('unreviewed')).toEqual(['admin']);
    expect(shown('mine')).toEqual(['admin']);
  });
});

describe('namespaceCounts', () => {
  it('counts the files each filter lists', () => {
    expect(namespaceCounts([nav, player, admin])).toEqual({
      all: 3,
      incomplete: 1,
      outdated: 1,
      unreviewed: 1,
      mine: 1,
    });
  });
});

describe('workLeft', () => {
  it('adds what is missing, outdated and unreviewed', () => {
    expect(workLeft(admin)).toBe(4);
  });
});

describe('nextNamespace', () => {
  it('leads to the first file with work left, or nowhere when all is done', () => {
    expect(nextNamespace([nav, player, admin])?.file).toBe('player');
    expect(nextNamespace([nav])).toBeNull();
  });
});
