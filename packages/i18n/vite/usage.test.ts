import { describe, expect, it } from 'vitest';
import { keysNamedIn } from './scan.ts';
import { importChain, overBoot, usageByChunk } from './usage.ts';

const KEYS = new Map<string, string[]>([
  ['admin', ['admin.title', 'admin.count', 'admin.invite']],
  ['nav', ['nav.home', 'nav.back']],
]);

const MODULES = new Map([
  ['/app/src/shell.tsx', keysNamedIn("t('nav.home')", KEYS)],
  ['/app/src/routes/admin.tsx', keysNamedIn("t('admin.title'); t('admin.count')", KEYS)],
  ['/app/src/menu.tsx', keysNamedIn('t(`nav.${where}`)', KEYS)],
]);

const BUNDLE = {
  'entry.js': {
    type: 'chunk',
    isEntry: true,
    imports: ['shared.js'],
    moduleIds: ['/app/src/main.tsx'],
  },
  'shared.js': { type: 'chunk', imports: [], moduleIds: ['/app/src/shell.tsx'] },
  'admin.js': { type: 'chunk', imports: ['shared.js'], moduleIds: ['/app/src/routes/admin.tsx'] },
  'style.css': { type: 'asset' },
};

const GRAPH = {
  importers: (id: string) =>
    ({
      '/app/src/shell.tsx': ['/app/src/root.tsx'],
      '/app/src/root.tsx': ['/app/node_modules/router/index.js'],
      '/app/node_modules/router/index.js': ['/app/src/main.tsx'],
    })[id] ?? [],
  isEntry: (id: string) => id === '/app/src/main.tsx',
};

describe('usageByChunk', () => {
  it('counts what a chunk names of a file against what the file holds', () => {
    const { chunks } = usageByChunk(BUNDLE, MODULES, KEYS);

    expect(chunks['admin.js']?.files.admin).toEqual({
      named: 2,
      of: 3,
      whole: false,
      keys: ['admin.count', 'admin.title'],
      from: { '/app/src/routes/admin.tsx': 2 },
    });
  });

  it('adds up what the entry and its static imports fetch, a lazy chunk left out', () => {
    const { boot } = usageByChunk(BUNDLE, MODULES, KEYS);

    expect(boot).toEqual({
      chunks: ['shared.js'],
      messages: 2,
      named: 1,
      files: { nav: { named: 1, of: 2, whole: false, via: [] } },
    });
  });

  it('says a file is read whole by a chunk that builds its keys', () => {
    const bundle = {
      'menu.js': { type: 'chunk', isEntry: true, moduleIds: ['/app/src/menu.tsx'] },
    };

    const { boot } = usageByChunk(bundle, MODULES, KEYS);

    expect(boot.files.nav).toMatchObject({ named: 0, of: 2, whole: true });
  });

  it('traces a file fetched at boot back to the entry', () => {
    const { boot } = usageByChunk(BUNDLE, MODULES, KEYS, GRAPH);

    expect(boot.files.nav?.via).toEqual([
      '/app/src/main.tsx',
      '/app/src/root.tsx',
      '/app/src/shell.tsx',
    ]);
  });
});

describe('a graph that labels its modules', () => {
  it('writes every module of the report the way the graph names it', () => {
    const label = (id: string) => id.replace('/app/', '');

    const { boot, chunks } = usageByChunk(BUNDLE, MODULES, KEYS, { ...GRAPH, label });

    expect(boot.files.nav?.via).toEqual(['src/main.tsx', 'src/root.tsx', 'src/shell.tsx']);
    expect(chunks['shared.js']?.files.nav?.from).toEqual({ 'src/shell.tsx': 1 });
  });
});

describe('importChain', () => {
  it('is empty for a module no entry reaches through static imports', () => {
    expect(importChain('/app/src/routes/admin.tsx', GRAPH)).toEqual([]);
  });

  it('gives up on a cycle no entry reaches', () => {
    const loop = { importers: () => ['/a.ts', '/b.ts'], isEntry: () => false };

    expect(importChain('/a.ts', loop)).toEqual([]);
  });
});

describe('overBoot', () => {
  it('says nothing of a build within its limit', () => {
    const { boot } = usageByChunk(BUNDLE, MODULES, KEYS, GRAPH);

    expect(overBoot(boot, 2)).toBeNull();
  });

  it('names each file a build over its limit fetches, with the imports that led to it', () => {
    const { boot } = usageByChunk(BUNDLE, MODULES, KEYS, GRAPH);

    expect(overBoot(boot, 1)).toBe(
      [
        'Messages fetched before the first screen: 2. This build allows 1.',
        '  nav: 1 of 2 named, through /app/src/main.tsx > /app/src/root.tsx > /app/src/shell.tsx',
      ].join('\n'),
    );
  });
});
