import { isAbsolute, join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors, lightColors } from '../src/core/tokens/colors';
import { WASH_ALPHA } from '../src/core/tokens/effects';
import {
  baseCss,
  fontsCss,
  kromaCss,
  kromaTokens,
  SOURCE_ROOTS,
  themeCss,
  tokensCss,
} from './tokens';

const transform = (code: string, id = '/app/src/styles.css') => {
  const plugin = kromaTokens();
  return plugin.transform.call({}, code, id)?.code ?? null;
};

describe('tokensCss', () => {
  it('emits every colour the palette declares', () => {
    const css = tokensCss();
    for (const token of Object.keys(colors)) {
      const name = token
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/surface(\d)/, 'surface-$1');
      expect(css).toContain(`--kroma-${name}:`);
    }
  });

  it('answers an unstamped root with prefers-color-scheme, and nothing else', () => {
    const css = tokensCss();
    expect(css).toContain('[data-theme="light"]');

    const media = css.split('@media (prefers-color-scheme: light) {')[1] ?? '';
    expect(media).toContain(':root:not([data-theme]) {');
    expect(media).toContain(`--kroma-bg: ${lightColors.bg.toLowerCase()};`);
    expect(media).not.toContain('[data-theme="dark"]');
  });

  it('leaves the dark palette as the bare-root default', () => {
    const css = tokensCss();
    expect(css).toContain(':root,\n[data-theme="dark"] {');
    // Dark once, then light twice: the attribute and the unstamped query.
    expect(css.match(/--kroma-bg: /g)).toHaveLength(3);
  });

  it('scopes a ground to any element, so a subtree can hold its own', () => {
    const css = tokensCss();
    expect(css).toContain('[data-theme="dark"] {');
    expect(css).toContain('[data-theme="light"] {');
    expect(css).not.toContain(':root[data-theme');

    const dark = css.split('[data-theme="dark"] {')[1]?.split('}')[0] ?? '';
    const light = css.split('[data-theme="light"] {')[1]?.split('}')[0] ?? '';
    expect(dark).toContain(`--kroma-bg: ${colors.bg.toLowerCase()};`);
    expect(dark).not.toContain(lightColors.bg.toLowerCase());
    expect(light).toContain(`--kroma-bg: ${lightColors.bg.toLowerCase()};`);
  });

  it('emits each elevation once per ground, never a fourth ground-free copy', () => {
    const css = tokensCss();
    expect(css.split(':root,\n')[0]).not.toContain('--shadow-card:');
    expect(css.match(/--shadow-card: /g)).toHaveLength(3);
  });

  it('spells the irregular names the stylesheets already consume', () => {
    const css = tokensCss();
    expect(css).toContain('--kroma-surface-1:');
    expect(css).toContain('--kroma-h265:');
    expect(css).toContain('--kroma-accent-soft-hover:');
  });
});

describe('the alpha steps', () => {
  it('emits a property per step the source writes, in both palettes', () => {
    const css = tokensCss();
    const [dark = '', light = ''] = css.split('[data-theme="light"]');
    expect(dark).toContain('--kroma-text-85: rgba(244, 243, 240, 0.85);');
    expect(light).toContain('--kroma-text-85: rgba(22, 21, 26, 0.85);');
  });

  it('spells a fractional step as a legal identifier', () => {
    expect(tokensCss()).toContain('--kroma-tint-2_5: rgba(255, 255, 255, 0.025);');
  });

  it('scans the repo, not the working directory a build happens to run from', () => {
    for (const root of SOURCE_ROOTS) expect(isAbsolute(root)).toBe(true);
    expect(SOURCE_ROOTS.some((root) => root.endsWith(`${sep}packages`))).toBe(true);
    // `tint/10` is <Button glass>'s rest fill: only a scan reaching packages/ui finds it.
    expect(tokensCss()).toContain('--kroma-tint-10:');
  });

  it('emits the steps the theme derives, which no source spells out', () => {
    const css = tokensCss();
    for (const step of Object.values(WASH_ALPHA)) {
      expect(css).toContain(`--kroma-accent-wash-${step}:`);
    }
  });

  it('leaves white and black alone, since neither moves with the ground', () => {
    expect(tokensCss()).not.toMatch(/--kroma-(white|black)-/);
  });
});

describe('themeCss', () => {
  it('points every Tailwind colour at its token', () => {
    expect(themeCss()).toContain('--color-accent: var(--kroma-accent);');
  });

  it('shortens the text tokens so the utility is not text-text-muted', () => {
    const css = themeCss();
    expect(css).toContain('--color-muted: var(--kroma-text-muted);');
    expect(css).toContain('--color-dim: var(--kroma-text-dim);');
  });
});

describe('fontsCss', () => {
  it('names the woff2 after the family in the typography tokens', () => {
    const css = fontsCss();
    expect(css).toContain('hanken-grotesk-latin.woff2');
    expect(css).toContain('bricolage-grotesque-latin-ext.woff2');
  });

  it('declares one face per family per subset', () => {
    expect(fontsCss().match(/@font-face/g)).toHaveLength(4);
  });
});

describe('the plugin', () => {
  it('expands the aggregate into type, tokens, motion and the reset', () => {
    const css = transform('@import "@kroma/ui/css";');
    expect(css).toContain('@font-face');
    expect(css).toContain('--kroma-bg:');
    expect(css).toContain('@keyframes kroma-img-in');
    expect(css).toContain('box-sizing: border-box;');
  });

  it('expands each half on its own', () => {
    expect(transform('@import "@kroma/ui/css/tokens";')).toBe(tokensCss());
    expect(transform('@import "@kroma/ui/css/theme";')).toBe(themeCss());
    expect(transform('@import "@kroma/ui/css/fonts";')).toBe(fontsCss());
    expect(transform('@import "@kroma/ui/css/base";')).toBe(baseCss());
  });

  it('leaves the reset out of the page furniture, for a target with its own', () => {
    const page = transform('@import "@kroma/ui/css/page";') ?? '';
    expect(page).toContain('::-webkit-scrollbar');
    expect(page).not.toContain('font-size: inherit');
    expect(transform('@import "@kroma/ui/css/base";')).toContain('font-size: inherit');
  });

  it('accepts single quotes and stray whitespace', () => {
    expect(transform("@import '@kroma/ui/css/tokens' ;")).toBe(tokensCss());
  });

  it('leaves a stylesheet without a directive alone', () => {
    expect(transform('body { color: red; }')).toBeNull();
  });

  it('ignores anything that is not CSS', () => {
    expect(transform('@import "@kroma/ui/css";', '/app/src/main.tsx')).toBeNull();
  });

  it('refuses a suffix it does not know rather than guessing', () => {
    expect(() => transform('@import "@kroma/ui/css/tokns";')).toThrow(/no such stylesheet/);
  });

  it('expands every directive in one stylesheet', () => {
    const css = transform('@import "@kroma/ui/css/tokens";\n@import "@kroma/ui/css/theme";');
    expect(css).toContain('--kroma-bg:');
    expect(css).toContain('@theme');
  });

  it('sweeps an emitted asset the transform could not reach', () => {
    const plugin = kromaTokens();
    const bundle = {
      'a.css': { type: 'asset', fileName: 'a.css', source: '@import "@kroma/ui/css/tokens";' },
      'b.js': { type: 'chunk', fileName: 'b.js', source: '@import "@kroma/ui/css/tokens";' },
    };
    plugin.generateBundle({}, bundle);
    expect(bundle['a.css'].source).toContain('--kroma-bg:');
    expect(bundle['b.js'].source).toBe('@import "@kroma/ui/css/tokens";');
  });

  it('leaves an emitted stylesheet that names no directive exactly as it was', () => {
    const plugin = kromaTokens();
    const binary = new Uint8Array([1, 2, 3]);
    const bundle = {
      'c.css': { type: 'asset', fileName: 'c.css', source: 'body { color: red; }' },
      'd.css': { type: 'asset', fileName: 'd.css', source: binary },
    };
    plugin.generateBundle({}, bundle);
    expect(bundle['c.css'].source).toBe('body { color: red; }');
    expect(bundle['d.css'].source).toBe(binary);
  });
});

describe('the plugin order', () => {
  const resolved = (...names: string[]) => ({ plugins: names.map((name) => ({ name })) });

  it('fails the build when Tailwind would reach the stylesheet first', () => {
    expect(() =>
      kromaTokens().configResolved(
        resolved('@tailwindcss/vite:scan', '@tailwindcss/vite:generate:build', 'kroma-tokens'),
      ),
    ).toThrow(/must come before tailwindcss/);
  });

  it('says nothing when it runs first, or where Tailwind is not installed', () => {
    expect(() =>
      kromaTokens().configResolved(resolved('kroma-tokens', '@tailwindcss/vite:generate:serve')),
    ).not.toThrow();
    expect(() => kromaTokens().configResolved(resolved('vite:css', 'kroma-tokens'))).not.toThrow();
  });
});

describe('a step written mid-session', () => {
  const STYLES = '/app/src/styles.css';
  const under = (name: string) => join(SOURCE_ROOTS[0] ?? '', 'ui', 'src', 'components', name);

  function devServer() {
    const module = { id: STYLES };
    const reloaded: unknown[] = [];
    return {
      module,
      reloaded,
      ctx: {
        environment: {
          moduleGraph: { getModuleById: (id: string) => (id === STYLES ? module : undefined) },
          reloadModule: (target: { id: string | null }) => {
            reloaded.push(target);
          },
        },
      },
    };
  }

  const expand = (plugin: ReturnType<typeof kromaTokens>) =>
    plugin.transform.call({}, '@import "@kroma/ui/css/tokens";', STYLES)?.code ?? '';

  it('reaches the stylesheet, and the page, without a dev server restart', async () => {
    const plugin = kromaTokens();
    expect(expand(plugin)).not.toContain('--kroma-accent-43:');

    const server = devServer();
    await plugin.hotUpdate.call(server.ctx, {
      file: under('made-up.tsx'),
      read: () => '<Box bg="accent/43" />',
    });

    expect(server.reloaded).toEqual([server.module]);
    expect(expand(plugin)).toContain('--kroma-accent-43:');
  });

  it('leaves the page alone for a change that names no new step', async () => {
    const plugin = kromaTokens();
    expand(plugin);

    const server = devServer();
    await plugin.hotUpdate.call(server.ctx, {
      file: under('made-up.tsx'),
      read: () => '<Box bg="accent/43" />',
    });

    expect(server.reloaded).toEqual([]);
  });

  it('ignores a step only a test spells, which no build would emit', async () => {
    const plugin = kromaTokens();
    expand(plugin);

    const server = devServer();
    await plugin.hotUpdate.call(server.ctx, {
      file: under('made-up.test.tsx'),
      read: () => '<Box bg="accent/44" />',
    });

    expect(server.reloaded).toEqual([]);
    expect(expand(plugin)).not.toContain('--kroma-accent-44:');
  });
});

describe('kromaCss', () => {
  it('carries no Tailwind at-rule, so a plain app can use it', () => {
    const css = kromaCss();
    expect(css).not.toContain('@theme');
    expect(css).not.toContain('@import "tailwindcss"');
  });
});
