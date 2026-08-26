import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { kromaTokens, VIRTUAL } from './stylesheet';
import { baseCss, fontsCss, SOURCE_ROOTS, themeCss, tokensCss, tvCss } from './tokens';

const transform = (code: string, id = '/app/src/styles.css') => {
  const plugin = kromaTokens();
  return plugin.transform.call({}, code, id)?.code ?? null;
};

const resolved = (part?: string) => `\0${VIRTUAL}${part ? `-${part}` : ''}.css`;

const served = (id: string, command: 'serve' | 'build' = 'build', base?: string) => {
  const plugin = kromaTokens();
  plugin.configResolved({ plugins: [{ name: 'kroma-tokens' }], command, base });
  return plugin.load.call({}, id);
};

// The first call walks every source root in the repo. Paid once here, so no test
// carries a 1.3s scan against the runner's 5s default.
beforeAll(() => {
  tokensCss();
}, 30_000);

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

  it('serves a television the reset with none of the page furniture on top', () => {
    const tv = transform('@import "@kroma/ui/css/tv";') ?? '';

    expect(tv).toContain('@font-face');
    expect(tv).toContain('--kroma-bg:');
    expect(tv).toContain('@keyframes kroma-img-in');
    expect(tv).toContain('font-size: inherit');
    expect(tv).not.toContain('::-webkit-scrollbar');
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

  it('still folds the step in where there is no dev server to reload', async () => {
    const plugin = kromaTokens();
    expect(expand(plugin)).not.toContain('--kroma-accent-47:');

    await plugin.hotUpdate.call(
      {},
      { file: under('made-up.tsx'), read: () => '<Box bg="accent/47" />' },
    );

    expect(expand(plugin)).toContain('--kroma-accent-47:');
  });
});

describe('the virtual stylesheet', () => {
  it('serves the whole design system to an entry that has no stylesheet at all', () => {
    const css = served(resolved()) ?? '';

    expect(css).toContain('@font-face');
    expect(css).toContain('--kroma-bg:');
    expect(css).toContain('@keyframes kroma-img-in');
    expect(css).toContain('box-sizing: border-box;');
  });

  it('serves each part under the name the directive spells it with', () => {
    expect(served(resolved('tv'))).toBe(tvCss());
    expect(served(resolved('tokens'))).toBe(tokensCss());
    expect(served(resolved('theme'))).toBe(themeCss());
    expect(served(resolved('base'))).toBe(baseCss());
    expect(served(resolved('fonts'))).toBe(fontsCss());
  });

  it('claims its own specifier and leaves every other import alone', () => {
    const plugin = kromaTokens();

    expect(plugin.resolveId(`${VIRTUAL}.css`)).toBe(resolved());
    expect(plugin.resolveId(resolved())).toBe(resolved());
    expect(plugin.resolveId(VIRTUAL)).toBeNull();
    expect(plugin.resolveId('./styles.css')).toBeNull();
  });

  it('leaves the rest of the virtual:kroma family to the plugins that serve it', () => {
    const plugin = kromaTokens();

    for (const id of ['virtual:kroma-props', 'virtual:kroma-icon-catalog', 'virtual:kroma-tv']) {
      expect(plugin.resolveId(id)).toBeNull();
      expect(plugin.load.call({}, `\0${id}`)).toBeNull();
    }
  });

  it('answers the direct request a <link> makes with the same sheet', () => {
    expect(served(`${resolved('tokens')}?direct`)).toBe(tokensCss());
  });

  it('refuses a part it does not know rather than serving an empty sheet', () => {
    expect(() => served(resolved('tokns'))).toThrow(/no such stylesheet/);
  });

  it('hands `?url` back to Vite on a build, so the asset is emitted and hashed', () => {
    expect(served(`${resolved()}?url`)).toBeNull();
  });

  it('points `?url` at the module the dev server serves, under its base', () => {
    expect(served(`${resolved()}?url`, 'serve')).toBe(
      'export default "/@id/__x00__virtual:kroma.css";',
    );
    expect(served(`${resolved()}?url`, 'serve', '/kit/')).toContain('"/kit/@id/__x00__');
  });

  it('watches the tokens the sheet is generated from', () => {
    const plugin = kromaTokens();
    const watched: string[] = [];

    plugin.load.call({ addWatchFile: (file) => watched.push(file) }, resolved());

    expect(watched.some((file) => file.endsWith(join('src', 'core', 'tokens', 'colors.ts')))).toBe(
      true,
    );
    expect(watched.some((file) => file.endsWith(join('src', 'styles', 'reset.ts')))).toBe(true);
  });

  it('reloads a served sheet when a step is written mid-session', async () => {
    const plugin = kromaTokens();
    const id = resolved('tokens');
    const module = { id };
    const reloaded: unknown[] = [];
    const ctx = {
      environment: {
        moduleGraph: { getModuleById: (asked: string) => (asked === id ? module : undefined) },
        reloadModule: (target: { id: string | null }) => {
          reloaded.push(target);
        },
      },
    };

    plugin.load.call({}, id);
    await plugin.hotUpdate.call(ctx, {
      file: join(SOURCE_ROOTS[0] ?? '', 'ui', 'src', 'components', 'made-up.tsx'),
      read: () => '<Box bg="accent/41" />',
    });

    expect(reloaded).toEqual([module]);
    expect(plugin.load.call({}, id)).toContain('--kroma-accent-41:');
  });
});
