// The web client's build stamp, served as a virtual module.
//
// The web app is a static SPA: nothing of Node ships, so the build identity
// cannot be READ at runtime the way it is on a phone. It is collected once here,
// at build time or dev-server start, and served as `virtual:build-info` - a
// module with no file on disk, whose entire body is the resolved constants.
//
// Two things carry the weight, and both are about the module id rather than the
// data. The resolved id is PREFIXED with a NUL byte, which is Rollup's
// convention for "this is mine, nobody else touch it" - without it another
// plugin, or Rollup's own file resolution, tries to read it from disk. And
// `load` must answer for the resolved id and nothing else: answering for the raw
// specifier means the module is served before any other plugin has had its say.
//
// The stamp itself degrades to 'unknown' rather than throwing, because a build
// from a source tarball still has to produce a site.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildInfoPlugin } from './build-info';

/** This package itself: it has a package.json and sits in the checkout. */
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

const VIRTUAL = 'virtual:build-info';
const RESOLVED = `\0${VIRTUAL}`;

/** The plugin's hooks, as Rollup will call them. */
function hooks() {
  const plugin = buildInfoPlugin({ projectRoot: PROJECT_ROOT }) as {
    name: string;
    resolveId: (source: string) => string | null;
    load: (id: string) => string | null;
  };
  return plugin;
}

describe('the plugin', () => {
  it('is named, so it can be found in a build log', () => {
    expect(hooks().name).toBe('kroma-build-info');
  });
});

describe('resolving the virtual id', () => {
  it('claims the specifier the app imports', () => {
    expect(hooks().resolveId(VIRTUAL)).toBe(RESOLVED);
  });

  it('prefixes the resolved id with a NUL', () => {
    // Rollup's convention for "this id is mine": without it, another plugin or
    // Rollup's own file resolution tries to read it from disk.
    expect(hooks().resolveId(VIRTUAL)?.startsWith('\0')).toBe(true);
  });

  it('claims nothing else', () => {
    const { resolveId } = hooks();
    for (const source of ['virtual:something-else', './build-info', 'react', RESOLVED, '']) {
      expect(resolveId(source)).toBeNull();
    }
  });
});

describe('serving the module', () => {
  it('answers for the RESOLVED id', () => {
    expect(hooks().load(RESOLVED)).toBeTypeOf('string');
  });

  it('does NOT answer for the raw specifier', () => {
    // Answering here would serve the module before any other plugin has had a
    // chance to resolve it.
    expect(hooks().load(VIRTUAL)).toBeNull();
  });

  it('answers for nothing else', () => {
    const { load } = hooks();
    for (const id of ['\0virtual:other', '/src/main.tsx', '']) {
      expect(load(id)).toBeNull();
    }
  });

  it('offers both import styles', () => {
    const code = hooks().load(RESOLVED) ?? '';
    // `import buildInfo from` and `import { commit } from` both have to work;
    // the app uses one and the settings panel the other.
    expect(code).toContain('export default');
    expect(code).toMatch(/export const \{[^}]*commit[^}]*\}/);
  });

  it('serves constants, not code that reads anything', () => {
    const code = hooks().load(RESOLVED) ?? '';
    // Nothing of Node ships to a static SPA; a `require` or an `execSync` here
    // would be a build that cannot run in a browser.
    expect(code).not.toContain('require(');
    expect(code).not.toContain('execSync');
    expect(code).not.toContain('process.');
  });
});

describe('the stamp it serves', () => {
  /** The default export, parsed back out of the generated module. */
  function stamp() {
    const code = hooks().load(RESOLVED) ?? '';
    const json = /export default (\{.*?\});/s.exec(code)?.[1];
    if (!json) throw new Error('no default export in the generated module');
    return JSON.parse(json) as Record<string, unknown>;
  }

  it('carries every field the app reads', () => {
    expect(Object.keys(stamp()).sort()).toEqual(
      ['branch', 'buildDate', 'commit', 'commitFull', 'dirty', 'repository', 'version'].sort(),
    );
  });

  it('stamps the version of the client it was pointed at', () => {
    // The plugin is shared, so the root it is given decides whose version this
    // is - not the directory the build was launched from.
    expect(stamp().version).toBe(
      JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8')).version,
    );
  });

  it('carries a real ISO build date', () => {
    expect(() => new Date(String(stamp().buildDate)).toISOString()).not.toThrow();
  });

  it('says `unknown` rather than throwing outside a checkout', () => {
    // This test runs inside one, so the values are real - what is pinned is that
    // each git field is a STRING either way. A build from a source tarball still
    // has to produce a site.
    for (const key of ['commit', 'commitFull', 'branch']) {
      expect(stamp()[key]).toBeTypeOf('string');
      expect(stamp()[key]).not.toBe('');
    }
    expect(stamp().dirty).toBeTypeOf('boolean');
  });

  it('is the same object on every load, collected ONCE', () => {
    // Per build, not per request: a dev server serving a new buildDate on each
    // reload would invalidate the module for every page that imports it. One
    // plugin instance deliberately - a second one is a second build, and is
    // entitled to its own stamp.
    const plugin = hooks();
    expect(plugin.load(RESOLVED)).toBe(plugin.load(RESOLVED));
  });
});
