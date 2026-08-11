// The icon subset decides what every client ships; missing a name means the
// app silently draws a question mark, in production only. So these tests pin
// the behaviour a broken scan would break — aliases survive, the fallback is
// always present, a renamed target fails loudly — not the exact icon count.
// They run against the real Tabler install and the real repo on purpose.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { kromaUi, sourceRoots, walkReaches, walkSources } from './index';

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

function rootWithBarrel(barrel: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-ui-barrel-'));
  const icons = join(dir, 'packages', 'ui', 'src', 'lib', 'icons');
  mkdirSync(icons, { recursive: true });
  writeFileSync(join(icons, 'glyph-source.ts'), 'export const EXPORTS = {};\n');
  const pkg = join(dir, 'node_modules', '@tabler', 'icons-react');
  mkdirSync(join(pkg, 'dist', 'esm'), { recursive: true });
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: '@tabler/icons-react', main: 'dist/esm/index.js' }),
  );
  writeFileSync(join(pkg, 'dist', 'esm', 'index.js'), '');
  writeFileSync(join(pkg, 'dist', 'esm', 'tabler-icons-react.mjs'), barrel);
  return dir;
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

describe('the workspace walk', () => {
  function tree(): string {
    const dir = mkdtempSync(join(tmpdir(), 'kroma-ui-walk-'));
    mkdirSync(join(dir, 'nested'), { recursive: true });
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    mkdirSync(join(dir, '.expo'), { recursive: true });
    writeFileSync(join(dir, 'a.ts'), 'a');
    writeFileSync(join(dir, 'nested', 'b.test.ts'), 'b');
    writeFileSync(join(dir, 'nested', 'c.tsx'), 'c');
    writeFileSync(join(dir, 'd.md'), 'd');
    writeFileSync(join(dir, 'node_modules', 'e.ts'), 'e');
    writeFileSync(join(dir, '.expo', 'f.ts'), 'f');
    return dir;
  }

  function collector(wants: (name: string) => boolean) {
    const saw: string[] = [];
    let ended = 0;
    return {
      saw,
      ended: () => ended,
      pass: {
        wants,
        read: (source: string) => {
          saw.push(source);
        },
        done: () => {
          ended += 1;
        },
      },
    };
  }

  it('carries every collector over one traversal, each file read once', () => {
    // The whole point of the pass shape: the icon subset and the token scan read
    // the same four directories, and the traversal is what a scan costs.
    const dir = tree();
    try {
      const all = collector(() => true);
      const shipped = collector((name) => !name.includes('.test.'));

      walkSources([dir], [all.pass, shipped.pass]);

      expect(all.saw.sort()).toEqual(['a', 'b', 'c']);
      expect(shipped.saw.sort()).toEqual(['a', 'c']);
      expect(all.ended()).toBe(1);
      expect(shipped.ended()).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ends a collector that wanted nothing, rather than leaving it open', () => {
    const dir = tree();
    try {
      const none = collector(() => false);
      walkSources([dir], [none.pass]);
      expect(none.saw).toEqual([]);
      expect(none.ended()).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('places a changed file against the walk without walking again', () => {
    const roots = sourceRoots('/repo');
    expect(roots).toEqual(
      ['packages', 'clients', 'apps', 'modules'].map((dir) => join('/repo', dir)),
    );

    expect(walkReaches(roots, join('/repo', 'packages', 'ui', 'src', 'a.tsx'))).toBe(true);
    expect(walkReaches(roots, join('/repo', 'packages', 'node_modules', 'a.ts'))).toBe(false);
    expect(walkReaches(roots, join('/repo', 'packages', '.expo', 'a.ts'))).toBe(false);
    expect(walkReaches(roots, join('/repo', 'packages', 'a.md'))).toBe(false);
    expect(walkReaches(roots, join('/repo', 'server', 'a.ts'))).toBe(false);
  });
});

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

  it('skips a barrel line that re-exports no name, and a workspace root that is not there', () => {
    const dir = rootWithBarrel(
      [
        "export {} from './icons/Ghost.mjs';",
        "export { default as IconHelpCircle } from './icons/IconHelpCircle.mjs';",
      ].join('\n'),
    );
    try {
      const plugin = kromaUi.vite({ repoRoot: dir });
      const notes: string[] = [];
      const code = plugin.load.call(
        { info: (m: string) => notes.push(m) },
        join(dir, GLYPH_SOURCE),
      );
      expect(code).not.toContain('Ghost');
      expect(notes).toEqual(['[kroma-ui] 1 of 1 Tabler icons kept']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores a name only a test spells, since no test reaches an artifact', () => {
    // Fixtures are full of words that happen to be Tabler slugs, each displacing a real glyph.
    const dir = rootWithBarrel(
      [
        "export { default as IconHelpCircle } from './icons/IconHelpCircle.mjs';",
        "export { default as IconRocket } from './icons/IconRocket.mjs';",
        "export { default as IconBanana } from './icons/IconBanana.mjs';",
      ].join('\n'),
    );
    try {
      const app = join(dir, 'clients', 'web', 'src');
      mkdirSync(app, { recursive: true });
      writeFileSync(join(app, 'page.tsx'), "const icon = 'rocket';\n");
      writeFileSync(join(app, 'page.test.tsx'), "const fruit = 'banana';\n");
      const code = kromaUi.vite({ repoRoot: dir }).load.call({}, join(dir, GLYPH_SOURCE));
      expect(code).toContain('IconRocket');
      expect(code).not.toContain('IconBanana');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
