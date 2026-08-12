import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { storyCode } from './story-code';

const RESOLVED = '\0virtual:kroma-story-code';

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: 'ES2022',
    module: 'ESNext',
    jsx: 'react-jsx',
    types: [],
  },
  include: ['src'],
});

interface Hooks {
  load: (id: string) => Promise<string | null>;
  handleHotUpdate: (at: { file: string; server: unknown }) => void;
}

let repo = '';

function badge(label: string): string {
  return `export default story({\n  name: 'Badge',\n  group: 'Media',\n  render: () => <Badge>${label}</Badge>,\n});\n`;
}

function open(): string {
  repo = mkdtempSync(join(tmpdir(), 'kroma-story-code-plugin-'));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'tsconfig.json'), TSCONFIG);
  writeFileSync(join(repo, 'src', 'badge.stories.tsx'), badge('4K'));
  return repo;
}

const plugin = (at: string): Hooks =>
  storyCode({
    tsconfig: join(at, 'tsconfig.json'),
    repo: at,
    include: (file) => file.endsWith('.stories.tsx'),
  }) as unknown as Hooks;

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
  repo = '';
});

describe('storyCode', () => {
  it('serves every story’s own JSX as `STORY_CODE`', async () => {
    const code = await plugin(open()).load(RESOLVED);
    expect(code).toContain('export const STORY_CODE =');
    expect(code).toContain('src/badge.stories.tsx');
    expect(code).toContain('<Badge>4K</Badge>');
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
    writeFileSync(join(at, 'src', 'badge.stories.tsx'), badge('HDR'));
    expect(await plugin(at).load(RESOLVED)).toContain('<Badge>HDR</Badge>');
  });

  it('watches the story files, so editing a scene refreshes the drawer', () => {
    const invalidated: unknown[] = [];
    const mod = { id: RESOLVED };
    const server = {
      moduleGraph: {
        getModuleById: (id: string) => (id === RESOLVED ? mod : undefined),
        invalidateModule: (found: unknown) => invalidated.push(found),
      },
    };
    const hooks = plugin(open());
    hooks.handleHotUpdate({ file: '/kit/src/badge.stories.tsx', server });
    hooks.handleHotUpdate({ file: '/kit/src/badge.tsx', server });
    expect(invalidated).toHaveLength(1);
  });

  it('serves nothing at all off a directory with no project in it', async () => {
    // A tarball, a half-checked-out tree: the drawer goes quiet, the build runs.
    repo = mkdtempSync(join(tmpdir(), 'kroma-story-code-none-'));
    expect(await plugin(repo).load(RESOLVED)).toBe('export const STORY_CODE = {};');
  });
});
