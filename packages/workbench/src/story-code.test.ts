import { describe, expect, it } from 'vitest';
import { codeAt, type StoryCodes } from './story-code';

const KEY = 'packages/ui/src/components/molecules/list-row/list-row.story.mdx';

const CODES: StoryCodes = {
  [KEY]: { name: 'ListRow', group: 'Layout' },
};

describe('codeAt', () => {
  it('finds the entry under the path a bundler globbed the story at', () => {
    expect(codeAt(CODES, `../../${KEY}`)?.name).toBe('ListRow');
  });

  it('finds it under the repository’s own spelling too', () => {
    expect(codeAt(CODES, KEY)?.group).toBe('Layout');
  });

  it('finds nothing for a file no build read', () => {
    expect(
      codeAt(CODES, '../../packages/ui/src/components/atoms/chip/chip.story.mdx'),
    ).toBeUndefined();
  });

  it('finds nothing rather than looping on a path with no separator at all', () => {
    expect(codeAt(CODES, 'list-row.story.mdx')).toBeUndefined();
  });
});
