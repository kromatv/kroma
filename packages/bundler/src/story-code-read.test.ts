import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readStoryMdxCode, type StoryCodes } from './story-code-read';

let repo = '';

function open(files: Record<string, string>): string {
  repo = mkdtempSync(join(tmpdir(), 'kroma-story-code-'));
  mkdirSync(join(repo, 'src'), { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(repo, 'src', name), text);
  }
  return repo;
}

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
  repo = '';
});

async function read(files: Record<string, string>): Promise<StoryCodes> {
  const at = open(files);
  return readStoryMdxCode(
    at,
    Object.keys(files).map((name) => join(at, 'src', name)),
  );
}

const DECLARED = [
  "import { defineStory } from '@kroma/workbench/story';",
  '',
  "export const story = defineStory({ name: 'ListRow', group: 'Layout', args: { a: 1 } });",
  '',
  'The row.',
  '',
].join('\n');

describe('readStoryMdxCode', () => {
  it('reads the name and group off the declaration, keyed repo-relative', async () => {
    const codes = await read({ 'list-row.story.mdx': DECLARED });
    expect(codes['src/list-row.story.mdx']).toEqual({ name: 'ListRow', group: 'Layout' });
  });

  it('reads a declaration written without the helper too', async () => {
    const codes = await read({
      'plain.story.mdx': "export const story = { group: 'Media' };\n\nProse.\n",
    });
    expect(codes['src/plain.story.mdx']).toEqual({ group: 'Media' });
  });

  it('ships nothing for a file it cannot read, rather than failing the build', async () => {
    const codes = await read({ 'broken.story.mdx': '<Unclosed\n' });
    expect(codes).toEqual({});
  });

  it('ships nothing for a document with no declaration', async () => {
    const codes = await read({ 'silent.story.mdx': 'Just prose.\n' });
    expect(codes).toEqual({});
  });
});
