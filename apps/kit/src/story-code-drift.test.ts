import { fileURLToPath } from 'node:url';
import { readStoryCode } from '@kroma/bundler/story-code';
import { describe, expect, it } from 'vitest';
import { STORIES } from './stories';

const repo = fileURLToPath(new URL('../../..', import.meta.url));

const codes = await readStoryCode({
  tsconfig: `${repo}packages/ui/tsconfig.json`,
  repo,
  include: (file) => file.includes('/packages/ui/src/') && file.endsWith('.stories.tsx'),
});

const LOADED = await Promise.all(STORIES.map((entry) => entry.load()));

const LIST_ROW = 'packages/ui/src/components/molecules/list-row/list-row.stories.tsx';

describe('the story code read off the kit', () => {
  it('finds the design system, not a handful of it', () => {
    expect(Object.keys(codes).length).toBeGreaterThan(50);
  });

  it('reads a composed example whole, so the format cannot drift silently', () => {
    // The scene the kit's own README points at: a row whose head is media.
    const scene = codes[LIST_ROW]?.scenes[1] ?? '';
    expect(scene).toContain('<ListRow.Leading>');
    expect(scene).toContain('<Avatar');
  });

  it('gives an `example` its JSX rather than the arrow the format wraps it in', () => {
    expect(codes[LIST_ROW]?.scenes[1]?.startsWith('<')).toBe(true);
  });

  it('leaves nothing indented by where it happened to sit in the file', () => {
    const indented = Object.values(codes)
      .flatMap((code) => [code.render ?? '', ...code.scenes])
      .filter((source) => source.startsWith(' '));
    expect(indented).toEqual([]);
  });
});

describe('what the registry ends up carrying', () => {
  const scenes = LOADED.flatMap((story) => story.scenes);

  it('shows source beside the great majority of the scenes a reader can click', () => {
    const shown = scenes.filter((scene) => scene.code).length;
    expect(shown / scenes.length).toBeGreaterThan(0.9);
  });

  it('joins every render a build read onto the story the bundler globbed', () => {
    // The join is by path, and the two halves spell one differently: what this
    // pins is that the suffix they share is enough to line them up.
    const read = Object.values(codes).filter((code) => code.render).length;
    expect(LOADED.filter((story) => story.code)).toHaveLength(read);
  });
});
