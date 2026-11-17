import { describe, expect, it } from 'vitest';
import { profileUrl, repositoryUrl } from './github-links';

describe('GitHub links', () => {
  it('points at a repository and at an account', () => {
    expect([repositoryUrl('o/r'), profileUrl('ada')]).toEqual([
      'https://github.com/o/r',
      'https://github.com/ada',
    ]);
  });
});
