import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { storyCode } from './story-code';

const RESOLVED = '\0virtual:kroma-story-code';

interface Hooks {
  load: (id: string) => Promise<string | null>;
  handleHotUpdate: (at: { file: string; server: unknown }) => void;
}

let repo = '';

function badge(group: string): string {
  return [
    "import { defineStory } from '@kroma/workbench/story';",
    '',
    `export const story = defineStory({ group: '${group}' });`,
    '',
    'The pill.',
    '',
  ].join('\n');
}

function open(): string {
  repo = mkdtempSync(join(tmpdir(), 'kroma-story-code-plugin-'));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'tsconfig.json'), '{}');
  writeFileSync(join(repo, 'src', 'badge.story.mdx'), badge('Media'));
  return repo;
}

const plugin = (at: string): Hooks =>
  storyCode({
    tsconfig: join(at, 'tsconfig.json'),
    repo: at,
    include: (file) => file.endsWith('.story.mdx'),
  }) as unknown as Hooks;

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
  repo = '';
});

describe('storyCode', () => {
  it('serves every story’s identity as `STORY_CODE`', async () => {
    const code = await plugin(open()).load(RESOLVED);
    expect(code).toContain('export const STORY_CODE =');
    expect(code).toContain('src/badge.story.mdx');
    expect(code).toContain('"group":"Media"');
  });

  it('scans the kit and nothing else by default', async () => {
    // The default filter names `packages/ui/src`, so a project anywhere else
    // contributes nothing rather than everything.
    const at = open();
    const hooks = storyCode({ tsconfig: join(at, 'tsconfig.json'), repo: at }) as unknown as Hooks;
    expect(await hooks.load(RESOLVED)).toBe('export const STORY_CODE = {};');
  });

  it('recomputes after an edit rather than serving the cache it just wrote', async () => {
    const at = open();
    await plugin(at).load(RESOLVED);
    writeFileSync(join(at, 'src', 'badge.story.mdx'), badge('Player'));
    expect(await plugin(at).load(RESOLVED)).toContain('"group":"Player"');
  });

  it('watches the story files, so editing one refreshes the index', () => {
    const invalidated: unknown[] = [];
    const mod = { id: RESOLVED };
    const server = {
      moduleGraph: {
        getModuleById: (id: string) => (id === RESOLVED ? mod : undefined),
        invalidateModule: (found: unknown) => invalidated.push(found),
      },
    };
    const hooks = plugin(open());
    hooks.handleHotUpdate({ file: '/kit/src/badge.story.mdx', server });
    hooks.handleHotUpdate({ file: '/kit/src/badge.tsx', server });
    expect(invalidated).toHaveLength(1);
  });

  it('watches the kit’s own stories by default, and nothing beside them', () => {
    const invalidated: unknown[] = [];
    const mod = { id: RESOLVED };
    const server = {
      moduleGraph: {
        getModuleById: (id: string) => (id === RESOLVED ? mod : undefined),
        invalidateModule: (found: unknown) => invalidated.push(found),
      },
    };
    const at = open();
    const hooks = storyCode({ tsconfig: join(at, 'tsconfig.json'), repo: at }) as unknown as Hooks;
    hooks.handleHotUpdate({ file: '/repo/packages/ui/src/badge/badge.story.mdx', server });
    hooks.handleHotUpdate({ file: '/repo/packages/ui/src/badge/badge.tsx', server });
    hooks.handleHotUpdate({ file: '/repo/clients/web/src/badge.story.mdx', server });
    expect(invalidated).toHaveLength(1);
  });

  it('serves nothing at all off a directory with no sources in it', async () => {
    // A tarball, a half-checked-out tree: the index goes quiet, the build runs.
    repo = mkdtempSync(join(tmpdir(), 'kroma-story-code-none-'));
    expect(await plugin(repo).load(RESOLVED)).toBe('export const STORY_CODE = {};');
  });
});
