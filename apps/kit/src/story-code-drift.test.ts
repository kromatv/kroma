import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStoryMdxCode } from '@kroma/bundler/story-code';
import { describe, expect, it } from 'vitest';
import { STORIES } from './stories';

const repo = fileURLToPath(new URL('../../..', import.meta.url));

const files = (await readdir(join(repo, 'packages/ui/src'), { recursive: true }))
  .filter((entry) => entry.endsWith('.story.mdx'))
  .map((entry) => join(repo, 'packages/ui/src', entry));

const codes = await readStoryMdxCode(repo, files);

const LOADED = await Promise.all(STORIES.map((entry) => entry.load()));

const LIST_ROW = 'packages/ui/src/components/molecules/list-row/list-row.story.mdx';

describe('the identity read off the documents', () => {
  it('finds the design system, not a handful of it', () => {
    expect(Object.keys(codes).length).toBeGreaterThan(50);
  });

  it('reads the group no path spells, keyed the way both bundlers can reach it', () => {
    expect(codes[LIST_ROW]?.group).toBe('Layout');
  });
});

describe('what the registry ends up carrying', () => {
  const scenes = LOADED.flatMap((story) => story.scenes);

  it('shows source beside the great majority of the scenes a reader can click', () => {
    const shown = scenes.filter((scene) => scene.code).length;
    expect(shown / scenes.length).toBeGreaterThan(0.9);
  });

  it('gives a fixed take its JSX as written, not the arrow the compiler wraps it in', () => {
    const listRow = LOADED.find((story) => story.id === 'list-row');
    const media = listRow?.scenes.find((scene) => scene.code?.includes('<ListRow.Leading>'));
    expect(media?.code?.startsWith('<')).toBe(true);
  });

  it('leaves nothing indented by where it happened to sit in the file', () => {
    const indented = scenes
      .map((scene) => scene.code ?? '')
      .filter((source) => source.startsWith(' '));
    expect(indented).toEqual([]);
  });
});
