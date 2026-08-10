import { beforeEach, describe, expect, it, vi } from 'vitest';

const esbuild = vi.hoisted(() => ({ build: vi.fn(async () => ({ errors: [] })) }));
vi.mock('esbuild', () => esbuild);

const { standaloneOptions, standaloneScript } = await import('./standalone-script');

const OPTS = { entry: '/repo/src/sw.ts', outfile: '/repo/public/sw.js' };

beforeEach(() => {
  esbuild.build.mockClear().mockResolvedValue({ errors: [] });
});

describe('the options', () => {
  it('produce one self-contained, minified IIFE', () => {
    const o = standaloneOptions(OPTS);
    expect(o).toMatchObject({ bundle: true, format: 'iife', minify: true, sourcemap: false });
    expect(o.entryPoints).toEqual(['/repo/src/sw.ts']);
    expect(o.outfile).toBe('/repo/public/sw.js');
  });

  it('lets a caller override any of them, including the defaults', () => {
    // Tizen's service worker wants CJS on a neutral platform at an older target.
    const o = standaloneOptions({
      ...OPTS,
      esbuild: { format: 'cjs', platform: 'neutral', target: 'chrome76', minify: false },
    });
    expect(o).toMatchObject({ format: 'cjs', platform: 'neutral', target: 'chrome76' });
    expect(o.minify).toBe(false);
    expect(o.bundle).toBe(true);
  });
});

describe('the plugin', () => {
  it('is named after its output, so a build log says which script it is', () => {
    expect(standaloneScript(OPTS).name).toBe('kroma:standalone-script:sw.js');
  });

  it('names a windows-separated output just as well', () => {
    expect(standaloneScript({ ...OPTS, outfile: 'C:\\repo\\public\\sw.js' }).name).toBe(
      'kroma:standalone-script:sw.js',
    );
  });

  it('runs for the client environment only', () => {
    // `buildStart` fires once per Vite environment; without this the worker is
    // bundled again for the SSR pass.
    const applyTo = standaloneScript(OPTS).applyToEnvironment;
    if (typeof applyTo !== 'function') throw new Error('the plugin must scope itself');
    const env = (name: string) => ({ name }) as unknown as Parameters<typeof applyTo>[0];
    expect(applyTo(env('client'))).toBe(true);
    expect(applyTo(env('ssr'))).toBe(false);
  });

  it('bundles at buildStart, which covers both dev and build', async () => {
    const plugin = standaloneScript(OPTS);
    expect(plugin.configureServer).toBeTypeOf('function');
    await (plugin.buildStart as () => Promise<void>).call(null);
    expect(esbuild.build).toHaveBeenCalledWith(standaloneOptions(OPTS));
  });
});

describe('watching in dev', () => {
  function serve(options = OPTS) {
    const listeners: ((file: string) => void)[] = [];
    const watcher = {
      add: vi.fn(),
      on: vi.fn((event: string, handler: (file: string) => void) => {
        if (event === 'change') listeners.push(handler);
      }),
    };
    const error = vi.fn();
    const server = { watcher, config: { logger: { error } } };
    const configure = standaloneScript(options).configureServer as (s: unknown) => void;
    configure.call(null, server);
    const change = (file: string) => {
      for (const listener of listeners) listener(file);
    };
    return { watcher, error, change };
  }

  it('watches the entry itself, wherever it sits', () => {
    expect(serve().watcher.add).toHaveBeenCalledWith(OPTS.entry);
  });

  it('rebuilds on an edit to the entry, and ignores every other file', () => {
    const dev = serve();
    dev.change('/repo/src/other.ts');
    expect(esbuild.build).not.toHaveBeenCalled();
    dev.change(OPTS.entry);
    expect(esbuild.build).toHaveBeenCalledTimes(1);
  });

  it('logs a failed rebuild rather than crashing the dev server', async () => {
    esbuild.build.mockRejectedValue(new Error('Unexpected "}"'));
    const dev = serve();
    dev.change(OPTS.entry);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dev.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected'));
  });
});
