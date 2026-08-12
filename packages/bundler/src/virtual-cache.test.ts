import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cachedVirtualModule } from './virtual-cache';

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'kroma');

// A fresh id per test, so one test's cache can never serve another's and the
// files are recognisable when they are swept up below.
let ids: string[] = [];
const freshId = (): string => {
  const id = `virtual-cache-test-${Math.random().toString(36).slice(2)}`;
  ids.push(id);
  return id;
};

afterEach(() => {
  let files: string[] = [];
  try {
    files = readdirSync(CACHE_DIR);
  } catch {
    files = [];
  }
  for (const file of files) {
    if (ids.some((id) => file.startsWith(id))) rmSync(join(CACHE_DIR, file), { force: true });
  }
  ids = [];
});

interface Hooks {
  name: string;
  resolveId: (source: string) => string | null;
  load: (id: string) => Promise<string | null>;
  handleHotUpdate: (at: { file: string; server: unknown }) => void;
}

function plugin(options: {
  id: string;
  version?: number;
  fingerprint?: () => Promise<string>;
  read: () => Promise<unknown>;
  watch?: (file: string) => boolean;
}): Hooks {
  return cachedVirtualModule({
    id: options.id,
    virtual: 'virtual:kroma-fixture',
    binding: 'FIXTURE',
    version: options.version ?? 1,
    fingerprint: options.fingerprint ?? (async () => 'one'),
    read: options.read,
    watch: options.watch,
  }) as unknown as Hooks;
}

const VIRTUAL = 'virtual:kroma-fixture';
const RESOLVED = `\0${VIRTUAL}`;

describe('the plugin', () => {
  it('is named after its id, so it can be found in a build log', () => {
    expect(plugin({ id: freshId(), read: async () => ({}) }).name).toMatch(
      /^kroma:virtual-cache-test-/,
    );
  });
});

describe('resolving the virtual id', () => {
  it('claims the specifier a host imports, prefixed with a NUL', () => {
    // Rollup's convention for "this id is mine": without it, another plugin or
    // Rollup's own file resolution tries to read it from disk.
    expect(plugin({ id: freshId(), read: async () => ({}) }).resolveId(VIRTUAL)).toBe(RESOLVED);
  });

  it('claims nothing else', () => {
    const { resolveId } = plugin({ id: freshId(), read: async () => ({}) });
    for (const source of ['virtual:kroma-props', './fixture', 'react', RESOLVED, '']) {
      expect(resolveId(source)).toBeNull();
    }
  });
});

describe('serving the module', () => {
  it('serves the read value as the named binding', async () => {
    const hooks = plugin({ id: freshId(), read: async () => ({ Button: ['label'] }) });
    expect(await hooks.load(RESOLVED)).toBe('export const FIXTURE = {"Button":["label"]};');
  });

  it('answers for the resolved id alone', async () => {
    // Answering for the raw specifier would serve the module before any other
    // plugin has had a chance to resolve it.
    const hooks = plugin({ id: freshId(), read: async () => ({}) });
    for (const id of [VIRTUAL, '\0virtual:other', '/src/main.tsx', '']) {
      expect(await hooks.load(id)).toBeNull();
    }
  });
});

describe('the cache', () => {
  it('spares a second build the reading', async () => {
    const id = freshId();
    let reads = 0;
    const read = async () => {
      reads += 1;
      return { reads };
    };
    expect(await plugin({ id, read }).load(RESOLVED)).toBe('export const FIXTURE = {"reads":1};');
    // A second plugin instance is a second build: same id, same fingerprint.
    expect(await plugin({ id, read }).load(RESOLVED)).toBe('export const FIXTURE = {"reads":1};');
    expect(reads).toBe(1);
  });

  it('recomputes when the fingerprint moves', async () => {
    const id = freshId();
    let reads = 0;
    const read = async () => {
      reads += 1;
      return { reads };
    };
    await plugin({ id, read, fingerprint: async () => 'one' }).load(RESOLVED);
    await plugin({ id, read, fingerprint: async () => 'two' }).load(RESOLVED);
    expect(reads).toBe(2);
  });

  it('recomputes when the version is bumped, so a stale cache cannot serve', async () => {
    const id = freshId();
    let reads = 0;
    const read = async () => {
      reads += 1;
      return { reads };
    };
    await plugin({ id, read, version: 1 }).load(RESOLVED);
    await plugin({ id, read, version: 2 }).load(RESOLVED);
    expect(reads).toBe(2);
  });

  it('serves without one when the fingerprint cannot be taken', async () => {
    // A cache failure must never fail a build: no hash means recompute, exactly
    // as if the cache did not exist.
    const id = freshId();
    let reads = 0;
    const read = async () => {
      reads += 1;
      return { reads };
    };
    const fingerprint = async () => {
      throw new Error('no such directory');
    };
    expect(await plugin({ id, read, fingerprint }).load(RESOLVED)).toBe(
      'export const FIXTURE = {"reads":1};',
    );
    await plugin({ id, read, fingerprint }).load(RESOLVED);
    expect(reads).toBe(2);
  });
});

describe('refreshing during dev', () => {
  function server() {
    const invalidated: unknown[] = [];
    const mod = { id: RESOLVED };
    return {
      invalidated,
      moduleGraph: {
        getModuleById: (id: string) => (id === RESOLVED ? mod : undefined),
        invalidateModule: (found: unknown) => invalidated.push(found),
      },
    };
  }

  it('invalidates the module when a watched file changes', () => {
    const hooks = plugin({
      id: freshId(),
      read: async () => ({}),
      watch: (file) => file.endsWith('.tsx'),
    });
    const dev = server();
    hooks.handleHotUpdate({ file: '/kit/button.tsx', server: dev });
    expect(dev.invalidated).toHaveLength(1);
  });

  it('leaves it alone for a file it does not watch', () => {
    const hooks = plugin({
      id: freshId(),
      read: async () => ({}),
      watch: (file) => file.endsWith('.tsx'),
    });
    const dev = server();
    hooks.handleHotUpdate({ file: '/kit/README.md', server: dev });
    expect(dev.invalidated).toHaveLength(0);
  });

  it('invalidates nothing where the module was never in the graph', () => {
    // A watched file can change before anything has imported the module.
    const hooks = plugin({ id: freshId(), read: async () => ({}), watch: () => true });
    const empty = {
      moduleGraph: {
        getModuleById: () => undefined,
        invalidateModule: () => {
          throw new Error('nothing to invalidate');
        },
      },
    };
    expect(() => hooks.handleHotUpdate({ file: '/kit/button.tsx', server: empty })).not.toThrow();
  });

  it('watches nothing at all where the caller named no files', () => {
    const hooks = plugin({ id: freshId(), read: async () => ({}) });
    const dev = server();
    hooks.handleHotUpdate({ file: '/kit/button.tsx', server: dev });
    expect(dev.invalidated).toHaveLength(0);
  });
});
