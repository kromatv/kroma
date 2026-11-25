import { describe, expect, it } from 'vitest';
import { baseReader, type Git } from './git-base.ts';

const MANIFEST = '{ "version": "0.3.4" }\n';

function gitAnswering(answers: Record<string, string>): Git {
  return (dir, args) => answers[`${dir}: ${args.join(' ')}`] ?? null;
}

describe('a file as the base branch has it', () => {
  it('is read where the branch left origin/main, from the folder the file is in', () => {
    const git = gitAnswering({
      '/work/notes: merge-base HEAD origin/main': 'a1b2c3\n',
      '/work/notes: show a1b2c3:./module.json': MANIFEST,
    });

    expect(baseReader(git)('/work/notes/module.json')).toBe(MANIFEST);
  });

  it('is read where the branch left main when there is no origin', () => {
    const git = gitAnswering({
      '/work/notes: merge-base HEAD main': 'd4e5f6\n',
      '/work/notes: show d4e5f6:./module.json': MANIFEST,
    });

    expect(baseReader(git)('/work/notes/module.json')).toBe(MANIFEST);
  });

  it('is nothing outside git, or with no main line to start from', () => {
    expect(baseReader(gitAnswering({}))('/work/notes/module.json')).toBeNull();
  });
});
