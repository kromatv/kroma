import { describe, expect, it } from 'vitest';
import { trackedBranches } from './env';

describe('trackedBranches', () => {
  it('reads one branch per repository from a comma-separated list', () => {
    const branches = trackedBranches({ LINGUA_BRANCHES: 'kromatv/kroma=feat/lingua, o/r=next' });

    expect([...branches]).toEqual([
      ['kromatv/kroma', 'feat/lingua'],
      ['o/r', 'next'],
    ]);
  });

  it('ignores an entry that does not name a repository and a branch', () => {
    expect(trackedBranches({ LINGUA_BRANCHES: 'nope, o/r=, =main, a/b=c d' }).size).toBe(0);
    expect(trackedBranches({}).size).toBe(0);
  });
});
