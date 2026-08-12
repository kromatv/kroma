import { describe, expect, it } from 'vitest';
import { folderOf, repoPath } from './repo-path';

const ROOT = 'packages/ui/src';
const STORY = `${ROOT}/components/atoms/button/button.stories.tsx`;

describe('repoPath', () => {
  it('cuts Vite’s glob key at the root it already contains', () => {
    expect(repoPath(ROOT, `../../${STORY}`)).toBe(STORY);
  });

  it('joins Metro’s context key onto the root it is relative to', () => {
    expect(repoPath(ROOT, './components/atoms/button/button.stories.tsx')).toBe(STORY);
    expect(repoPath(ROOT, '../button.stories.tsx')).toBe(`${ROOT}/button.stories.tsx`);
  });
});

describe('folderOf', () => {
  it('is the folder a file sits in', () => {
    expect(folderOf(STORY)).toBe(`${ROOT}/components/atoms/button`);
  });

  it('is the path itself where there is no folder over it', () => {
    expect(folderOf('button.stories.tsx')).toBe('button.stories.tsx');
  });
});
