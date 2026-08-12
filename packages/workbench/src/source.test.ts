import { describe, expect, it } from 'vitest';
import { type StorySource, sourceUrl } from './source';

const SHA = 'c51eb485a1b2c3d4e5f60718293a4b5c6d7e8f90';

const KROMA: StorySource = {
  repository: 'https://github.com/maxscharwath/kroma',
  commit: SHA,
  dirty: false,
  root: 'packages/ui/src',
};

// What each bundler hands the workbench for the same file: Vite's glob key is
// relative to the host it globbed from, Metro's context key to the directory
// the context was opened on.
const VITE = '../../packages/ui/src/components/atoms/button/button.stories.tsx';
const METRO = './components/atoms/button/button.stories.tsx';
const FOLDER = `https://github.com/maxscharwath/kroma/tree/${SHA}/packages/ui/src/components/atoms/button`;

describe('sourceUrl', () => {
  it('pins the folder the story was found in to the commit that was built', () => {
    expect(sourceUrl(KROMA, VITE)).toBe(FOLDER);
  });

  it('reads Metro’s path, relative to the root, as the same folder', () => {
    expect(sourceUrl(KROMA, METRO)).toBe(FOLDER);
  });

  it('takes an absolute path from the root onwards', () => {
    const absolute = '/Users/someone/kroma/packages/ui/src/foundations/colors.stories.tsx';
    expect(sourceUrl(KROMA, absolute)).toBe(
      `https://github.com/maxscharwath/kroma/tree/${SHA}/packages/ui/src/foundations`,
    );
  });

  it('links a dirty tree at the commit its edits sit on', () => {
    expect(sourceUrl({ ...KROMA, dirty: true }, VITE)).toBe(FOLDER);
  });

  it('links nothing when the build was made outside a checkout', () => {
    expect(sourceUrl({ ...KROMA, commit: null }, VITE)).toBeNull();
    expect(sourceUrl({ ...KROMA, commit: 'unknown' }, VITE)).toBeNull();
    expect(sourceUrl({ ...KROMA, commit: '' }, VITE)).toBeNull();
  });

  it('refuses a commit that is not a revision, rather than pinning to a branch', () => {
    expect(sourceUrl({ ...KROMA, commit: 'main' }, VITE)).toBeNull();
    expect(sourceUrl({ ...KROMA, commit: 'HEAD' }, VITE)).toBeNull();
    expect(sourceUrl({ ...KROMA, commit: 'v0.1.3' }, VITE)).toBeNull();
  });

  it('accepts the short revision git also answers with', () => {
    expect(sourceUrl({ ...KROMA, commit: 'c51eb485' }, VITE)).toBe(
      'https://github.com/maxscharwath/kroma/tree/c51eb485/packages/ui/src/components/atoms/button',
    );
  });

  it('links nothing without a remote to link to', () => {
    expect(sourceUrl({ ...KROMA, repository: null }, VITE)).toBeNull();
  });

  it('links nothing for a story with no file behind it', () => {
    expect(sourceUrl(KROMA, undefined)).toBeNull();
    expect(sourceUrl(KROMA, '')).toBeNull();
  });

  it('refuses a remote the platform must not be handed', () => {
    expect(sourceUrl({ ...KROMA, repository: 'file:///Users/someone/kroma' }, VITE)).toBeNull();
    expect(
      sourceUrl({ ...KROMA, repository: 'git@github.com:maxscharwath/kroma' }, VITE),
    ).toBeNull();
  });

  it('does not double the slash a remote may end on', () => {
    expect(
      sourceUrl({ ...KROMA, repository: 'https://github.com/maxscharwath/kroma/' }, VITE),
    ).toBe(FOLDER);
  });
});
