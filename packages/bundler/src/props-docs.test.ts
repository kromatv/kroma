import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { propDocs } from './props-docs';

const TSCONFIG = JSON.stringify({
  compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', noEmit: true, types: [] },
  include: ['src'],
});

const BADGE = `export interface BadgeProps {\n  /** How many. */\n  count: number;\n}\nexport const Badge = (props: BadgeProps) => props.count;\n`;

const RESOLVED = '\0virtual:kroma-props';

interface Hooks {
  load: (id: string) => Promise<string | null>;
  handleHotUpdate: (at: { file: string; server: unknown }) => void;
}

let project = '';

function chip(docs: string): string {
  return `export interface ChipProps {\n  /** ${docs} */\n  label: string;\n}\nexport const Chip = (props: ChipProps) => props.label;\n`;
}

function open({ lockfile = true } = {}): string {
  project = mkdtempSync(join(tmpdir(), 'kroma-props-docs-'));
  mkdirSync(join(project, 'src'));
  writeFileSync(join(project, 'tsconfig.json'), TSCONFIG);
  // A real project has one above it, and the fingerprint reads it: a dependency
  // bump can change an inherited prop's type.
  if (lockfile) writeFileSync(join(project, 'bun.lock'), '{}\n');
  writeFileSync(join(project, 'src', 'chip.ts'), chip('The words on the chip.'));
  writeFileSync(join(project, 'src', 'badge.ts'), BADGE);
  writeFileSync(join(project, 'src', 'notes.md'), '# not a source file\n');
  return join(project, 'tsconfig.json');
}

const plugin = (tsconfig: string, include?: (file: string) => boolean): Hooks =>
  propDocs({ tsconfig, include }) as unknown as Hooks;

const scanned = (file: string) => file.includes('/src/');

afterEach(() => {
  if (project) rmSync(project, { recursive: true, force: true });
  project = '';
});

describe('propDocs', () => {
  it('serves the components as `PROPS`', async () => {
    const code = await plugin(open(), scanned).load(RESOLVED);
    expect(code).toContain('export const PROPS =');
    expect(code).toContain('"The words on the chip."');
    expect(code).toContain('"How many."');
  });

  it('scans only what `include` accepts', async () => {
    const code = await plugin(open(), () => false).load(RESOLVED);
    expect(code).toBe('export const PROPS = {};');
  });

  it('scans the kit and nothing else by default', async () => {
    // The default filter names `packages/ui/src`, so a project anywhere else
    // contributes nothing rather than everything.
    expect(await plugin(open()).load(RESOLVED)).toBe('export const PROPS = {};');
  });

  it('serves a project with no lockfile above it at all', async () => {
    // A source tarball has none, and the fingerprint has to answer anyway.
    const code = await plugin(open({ lockfile: false }), scanned).load(RESOLVED);
    expect(code).toContain('"The words on the chip."');
  });

  it('recomputes after a source edit rather than serving the cache it just wrote', async () => {
    // The fingerprint is the scanned sources' paths, sizes and mtimes: an edit
    // moves it, which is what keeps the Props tab something you believe.
    const tsconfig = open();
    await plugin(tsconfig, scanned).load(RESOLVED);
    writeFileSync(join(project, 'src', 'chip.ts'), chip('What the chip says, in a word or two.'));
    const code = await plugin(tsconfig, scanned).load(RESOLVED);
    expect(code).toContain('"What the chip says, in a word or two."');
  });

  it('watches whatever it scans, so editing a component refreshes the panel', async () => {
    const invalidated: unknown[] = [];
    const mod = { id: RESOLVED };
    const server = {
      moduleGraph: {
        getModuleById: (id: string) => (id === RESOLVED ? mod : undefined),
        invalidateModule: (found: unknown) => invalidated.push(found),
      },
    };
    const hooks = plugin(open(), scanned);
    hooks.handleHotUpdate({ file: '/kit/src/chip.ts', server });
    hooks.handleHotUpdate({ file: '/kit/CHANGELOG.md', server });
    expect(invalidated).toHaveLength(1);
  });
});
