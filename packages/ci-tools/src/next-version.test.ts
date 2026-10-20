import { describe, expect, it } from 'vitest';
import { type Commit, parseCommit } from './commits';
import { nextVersion } from './next-version';

const commits = (...subjects: string[]): Commit[] =>
  subjects.flatMap((subject) => parseCommit('sha', subject) ?? []);

describe('nextVersion', () => {
  it('bumps the patch for a feature or a fix below 1.0', () => {
    expect(nextVersion('0.1.39', commits('feat: a', 'fix: b'))).toBe('0.1.40');
  });

  it('bumps the minor for a breaking change below 1.0', () => {
    expect(nextVersion('0.1.39', commits('fix: a', 'feat!: b'))).toBe('0.2.0');
  });

  it('follows semver from 1.0 on', () => {
    expect(nextVersion('1.2.3', commits('fix: a'))).toBe('1.2.4');
    expect(nextVersion('1.2.3', commits('fix: a', 'feat: b'))).toBe('1.3.0');
    expect(nextVersion('1.2.3', commits('refactor!: c'))).toBe('2.0.0');
  });

  it('releases nothing for maintenance alone', () => {
    expect(nextVersion('0.1.39', commits('chore: a', 'ci(test): b', 'docs: c'))).toBeNull();
  });

  it('refuses a version that is not a triplet', () => {
    expect(() => nextVersion('0.1.39-rc1', [])).toThrow(/not X\.Y\.Z/);
  });
});
