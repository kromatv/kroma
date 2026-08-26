import { isAbsolute, sep } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { colors, lightColors } from '../src/core/tokens/colors';
import { WASH_ALPHA } from '../src/core/tokens/effects';
import { kromaTokens } from './stylesheet';
import { fontsCss, kromaCss, SOURCE_ROOTS, themeCss, tokensCss } from './tokens';

// The first call walks every source root in the repo. Paid once here, so no test
// carries a 1.3s scan against the runner's 5s default.
beforeAll(() => {
  tokensCss();
}, 30_000);

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

  // A build takes `optional` and the CLS it was chosen for; the dev server
  // takes `swap`, where the stylesheet arrives with the module graph and a
  // dropped face means reloading until the typeface turns up.
  it('ships `optional` by default, which is what a build wants', () => {
    expect(fontsCss()).toContain('font-display: optional;');
    expect(fontsCss()).not.toContain('font-display: swap;');
  });

  it('swaps a late face in on the dev server rather than dropping it', () => {
    const plugin = kromaTokens();
    plugin.configResolved({ plugins: [{ name: 'kroma-tokens' }], command: 'serve' });
    const css = plugin.transform.call({}, '@import "@kroma/ui/css";', '/app/src/styles.css')?.code;

    expect(css).toContain('font-display: swap;');
  });

  it('leaves a build on `optional`, whatever the dev server does', () => {
    const plugin = kromaTokens();
    plugin.configResolved({ plugins: [{ name: 'kroma-tokens' }], command: 'build' });
    const css = plugin.transform.call({}, '@import "@kroma/ui/css";', '/app/src/styles.css')?.code;

    expect(css).toContain('font-display: optional;');
  });
});

describe('kromaCss', () => {
  it('carries no Tailwind at-rule, so a plain app can use it', () => {
    const css = kromaCss();
    expect(css).not.toContain('@theme');
    expect(css).not.toContain('@import "tailwindcss"');
  });
});
