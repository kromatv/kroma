import { describe, expect, it } from 'vitest';
import { story } from './story';
import { codeAt, type StoryCodes, withCode } from './story-code';

const KEY = 'packages/ui/src/components/molecules/list-row/list-row.stories.tsx';

const CODES: StoryCodes = {
  [KEY]: { render: '<ListRow.Root />', scenes: ['<ListRow.Group />', '<ListRow.Root icon="x" />'] },
};

const listRow = () =>
  story({
    name: 'ListRow',
    group: 'Layout',
    render: () => null,
    scenes: [{ name: 'A group' }, { name: 'Media at the head' }, { name: 'Unread' }],
  });

describe('codeAt', () => {
  it('finds the entry under the path a bundler globbed the story at', () => {
    expect(codeAt(CODES, `../../${KEY}`)?.render).toBe('<ListRow.Root />');
  });

  it('finds it under the repository’s own spelling too', () => {
    expect(codeAt(CODES, KEY)?.render).toBe('<ListRow.Root />');
  });

  it('finds nothing for a file no build read', () => {
    expect(
      codeAt(CODES, '../../packages/ui/src/components/atoms/chip/chip.stories.tsx'),
    ).toBeUndefined();
  });

  it('finds nothing rather than looping on a path with no separator at all', () => {
    expect(codeAt(CODES, 'list-row.stories.tsx')).toBeUndefined();
  });
});

describe('withCode', () => {
  it('attaches the story’s own render and each scene’s source, in order', () => {
    const attached = withCode(listRow(), CODES[KEY]);
    expect(attached.code).toBe('<ListRow.Root />');
    expect(attached.scenes.map((scene) => scene.code)).toEqual([
      '<ListRow.Group />',
      '<ListRow.Root icon="x" />',
      undefined,
    ]);
  });

  it('leaves the story alone where the build read nothing, which is every Metro build', () => {
    const plain = listRow();
    expect(withCode(plain, undefined)).toBe(plain);
  });

  it('leaves a story that names a component without one, so the drawer generates it', () => {
    const attached = withCode(listRow(), { scenes: [] });
    expect(attached.code).toBeUndefined();
  });
});
