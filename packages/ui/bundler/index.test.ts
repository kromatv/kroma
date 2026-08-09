// The icon subset decides what every client ships; missing a name means the
// app silently draws a question mark, in production only. So these tests pin
// the behaviour a broken scan would break — aliases survive, the fallback is
// always present, a renamed target fails loudly — not the exact icon count.
// They run against the real Tabler install and the real repo on purpose.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { kromaUi } from './index';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const GLYPH_SOURCE = 'packages/ui/src/lib/icons/glyph-source.ts';

const A_NAME_THE_SOURCE_USES = 'help-circle';

const exportNameOf = (slug: string) =>
  `Icon${slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')}`;

function tablerEsm(): string {
  const entry = createRequire(join(REPO_ROOT, 'packages/ui/package.json')).resolve(
    '@tabler/icons-react',
  );
  return join(entry.slice(0, entry.lastIndexOf(`${sep}dist${sep}`)), 'dist', 'esm');
}

function tablerNames(): string[] {
  const barrel = readFileSync(join(tablerEsm(), 'tabler-icons-react.mjs'), 'utf8');
  return [...barrel.matchAll(/default as (Icon[A-Za-z0-9]+)/g)].map((m) => m[1] as string);
}

function loadGlyphSource(options: Parameters<typeof kromaUi.vite>[0] = { repoRoot: REPO_ROOT }) {
  const plugin = kromaUi.vite(options);
  const notes: string[] = [];
  const code = plugin.load.call(
    { info: (m: string) => notes.push(m) },
    join(REPO_ROOT, GLYPH_SOURCE),
  );
  return { code, notes };
}

describe('the vite half', () => {
  it('only swaps the one module the runtime imports Tabler through', () => {
    const plugin = kromaUi.vite({ repoRoot: REPO_ROOT });
    for (const other of ['/src/main.tsx', '/packages/ui/src/lib/icons/glyphs.ts', '']) {
      expect(plugin.load.call({}, other)).toBeNull();
    }
  });

  it('applies to builds only, so dev keeps the full set and its own resolution', () => {
    expect(kromaUi.vite({ repoRoot: REPO_ROOT }).apply).toBe('build');
  });

  it('hands back a module that names every icon it imports', () => {
    const { code } = loadGlyphSource();
    expect(code).toBeTypeOf('string');
    const imported = [...(code ?? '').matchAll(/^import (Icon[A-Za-z0-9]+) from/gm)].map(
      (m) => m[1],
    );
    const exported = /export const EXPORTS = \{ ([^}]*) \}/.exec(code ?? '')?.[1]?.split(', ');
    expect(imported.length).toBeGreaterThan(0);
    expect(exported).toEqual(imported);
  });

  it('always keeps the fallback, which is drawn for a name that is not an icon', () => {
    const { code } = loadGlyphSource();
    expect(code).toContain('export const FALLBACK = IconHelpCircle;');
    expect(code).toContain('import IconHelpCircle from');
  });

  it('draws its catalogue from the barrel, so aliases are reachable', () => {
    // 66 of Tabler's exports are ALIASES with no module of their own
    // (`IconDiscountCheck` lives in `IconRosetteDiscount.mjs`). A directory
    // listing misses them, and because they stay in the .d.ts they typecheck and
    // draw in a full build — so the subset would fall back to the question mark
    // for them in production only. More known names than icon files is what
    // distinguishes the two sources, whether or not any alias is used today.
    const available = Number(/\d+ of (\d+)/.exec(loadGlyphSource().notes[0] ?? '')?.[1]);
    const files = readdirSync(join(tablerEsm(), 'icons')).filter((f) => f.endsWith('.mjs')).length;
    expect(available).toBeGreaterThan(files);
  });

  it('imports each icon from its own module rather than the barrel', () => {
    // Per-icon so the result does not depend on the barrel being shakeable.
    const { code } = loadGlyphSource();
    expect(code).not.toMatch(/from ".*tabler-icons-react\.mjs"/);
    expect(code).toMatch(/from ".*[/\\]icons[/\\]Icon[A-Za-z0-9]+\.mjs"/);
  });

  it('reports what it left out, so a build log says the subset ran', () => {
    const { notes } = loadGlyphSource();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^\[kroma-ui] \d+ of \d+ Tabler icons kept$/);
  });

  it('keeps fewer icons than Tabler ships, which is the whole point', () => {
    const [, kept, available] = /(\d+) of (\d+)/.exec(loadGlyphSource().notes[0] ?? '') ?? [];
    expect(Number(kept)).toBeGreaterThan(0);
    expect(Number(kept)).toBeLessThan(Number(available));
  });

  it('leaves the module alone when an app asks for the full catalogue', () => {
    // `iconNames()` and `hasGlyph()` answer from whatever shipped, so the kit's
    // icon gallery would otherwise list a couple of hundred of them.
    const plugin = kromaUi.vite({ repoRoot: REPO_ROOT, icons: 'full' });
    expect(plugin.load.call({}, join(REPO_ROOT, GLYPH_SOURCE))).toBeNull();
  });
});

describe('the module path it is keyed on', () => {
  function rootWithoutTarget() {
    const dir = mkdtempSync(join(tmpdir(), 'kroma-ui-bundler-'));
    mkdirSync(join(dir, 'packages', 'ui', 'src', 'lib', 'icons'), { recursive: true });
    return dir;
  }

  it('fails loudly when the target moved, rather than shipping every icon', () => {
    // Both adapters match by path, and a path is what a refactor breaks
    // silently: the swap would simply never fire, under a green build.
    const dir = rootWithoutTarget();
    try {
      expect(() => kromaUi.vite({ repoRoot: dir })).toThrow(/glyph-source\.ts not found/);
      expect(() => kromaUi.metro({}, { repoRoot: dir })).toThrow(/glyph-source\.ts not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says what to do about it', () => {
    const dir = rootWithoutTarget();
    try {
      expect(() => kromaUi.vite({ repoRoot: dir })).toThrow(/update GLYPH_SOURCE/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not check the path when the subset is off, since nothing is swapped', () => {
    const dir = rootWithoutTarget();
    try {
      expect(() => kromaUi.vite({ repoRoot: dir, icons: 'full' })).not.toThrow();
      expect(kromaUi.metro({}, { repoRoot: dir, icons: 'full' })).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the metro half', () => {
  it('returns the same config it was given, with a resolver installed', () => {
    const config = { resolver: { sourceExts: ['ts'] } };
    const out = kromaUi.metro(config, { repoRoot: REPO_ROOT });
    expect(out).toBe(config);
    expect(out.resolver?.sourceExts).toEqual(['ts']);
    expect(out.resolver?.resolveRequest).toBeTypeOf('function');
  });

  it('delegates every module but the one it swaps', () => {
    const upstream = vi_fn();
    const out = kromaUi.metro({}, { repoRoot: REPO_ROOT });
    const context = { resolveRequest: upstream };
    out.resolver?.resolveRequest?.(context, 'react-native', 'ios');
    expect(upstream.calls).toEqual([['react-native', 'ios']]);
  });

  it('points the swapped module at a file on disk, because metro has no virtual modules', () => {
    const out = kromaUi.metro({}, { repoRoot: REPO_ROOT });
    const context = { resolveRequest: vi_fn() };
    const resolved = out.resolver?.resolveRequest?.(context, join(REPO_ROOT, GLYPH_SOURCE), 'ios');
    expect(resolved?.filePath).toMatch(
      /node_modules[/\\]\.cache[/\\]kroma-ui[/\\]glyph-source\.js$/,
    );
  });

  it('writes that file before it returns, not on first resolution', () => {
    // `expo export` hashes one filesystem snapshot taken after config eval, so a
    // module first written during resolution is absent from it and the bundle
    // dies on `Failed to get the SHA-1`. Only the dev server's watcher hid it,
    // which is why this failed on a clean checkout and passed on a warm one.
    const generated = join(REPO_ROOT, 'node_modules', '.cache', 'kroma-ui', 'glyph-source.js');
    rmSync(generated, { force: true });

    kromaUi.metro({}, { repoRoot: REPO_ROOT });

    expect(existsSync(generated)).toBe(true);
    expect(readFileSync(generated, 'utf8')).toContain('export const FALLBACK = IconHelpCircle;');
  });
});

function vi_fn() {
  const calls: unknown[][] = [];
  const fn = (_ctx: unknown, name: string, platform: string | null) => {
    calls.push([name, platform]);
    return { filePath: name };
  };
  return Object.assign(fn, { calls });
}

describe('the scan', () => {
  it('is done once per package, not once per bundler process', () => {
    // A full TV build runs six bundler processes; within one, the workspace walk
    // must not repeat. Identical output is the observable half of that.
    expect(loadGlyphSource().code).toBe(loadGlyphSource().code);
  });

  it('keeps a name the source actually writes', () => {
    // The one failure that matters: an icon the app draws going missing. This
    // name is written as a literal in @kroma/ui's own source.
    expect(loadGlyphSource().code).toContain(exportNameOf(A_NAME_THE_SOURCE_USES));
  });

  it('leaves out a real Tabler icon that nothing mentions', () => {
    // The other half of the same claim: it is a SUBSET, not a rename of the
    // barrel. Picked from Tabler's own exports so the absence means "not used"
    // rather than "not an icon".
    const { code } = loadGlyphSource();
    const unused = tablerNames().find((n) => !(code ?? '').includes(`import ${n} `));
    expect(unused).toBeTypeOf('string');
  });
});
