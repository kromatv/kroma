import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { messageKeysIn, messageSubset, subsetCatalog } from './message-subset';

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'kroma-messages-'));
  for (const [path, source] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true });
    writeFileSync(full, source);
  }
  return root;
}

describe('the scan', () => {
  it('finds a key behind t() and behind msg(), in any quote', () => {
    const root = tree({
      'a/one.tsx': "const label = t('common.close');",
      'a/two.ts': 'const e = msg(`form.required`);',
      'a/three.ts': 'const x = t("player.play");',
    });
    expect(messageKeysIn([root])).toEqual(
      new Set(['common.close', 'form.required', 'player.play']),
    );
  });

  it('walks nested directories and skips node_modules and dotfiles', () => {
    const root = tree({
      'deep/nested/here.tsx': "t('a.kept')",
      'node_modules/dep/index.ts': "t('a.dropped')",
      '.cache/gen.ts': "t('b.dropped')",
      'notes.md': "t('c.dropped')",
    });
    expect(messageKeysIn([root])).toEqual(new Set(['a.kept']));
  });

  it('reads no key out of a call whose argument is not a literal', () => {
    const root = tree({ 'a.ts': 'const label = t(entry.labelKey);' });
    expect(messageKeysIn([root]).size).toBe(0);
  });

  it('answers empty for a root that is not there', () => {
    expect(messageKeysIn(['/no/such/tree']).size).toBe(0);
  });
});

describe('the subset', () => {
  const CATALOG = {
    'common.close': 'Fermer',
    'admin.backupWarning': 'Attention',
    'lang.fr': 'Français',
    'lang.en': 'English',
    'player.episodes_one': '{count} épisode',
    'player.episodes_other': '{count} épisodes',
    'admin.jobs_other': '{count} tâches',
  };

  it('keeps a named message and drops every other', () => {
    expect(subsetCatalog(CATALOG, new Set(['common.close']))).toEqual({
      'common.close': 'Fermer',
      'lang.fr': 'Français',
      'lang.en': 'English',
    });
  });

  it('keeps the plural variants of a named message', () => {
    const kept = subsetCatalog(CATALOG, new Set(['player.episodes']));
    expect(kept['player.episodes_one']).toBe('{count} épisode');
    expect(kept['player.episodes_other']).toBe('{count} épisodes');
    expect(kept['admin.jobs_other']).toBeUndefined();
  });

  it('always keeps the language names, which locale detection matches on', () => {
    expect(Object.keys(subsetCatalog(CATALOG, new Set()))).toEqual(['lang.fr', 'lang.en']);
  });
});

const EN = fileURLToPath(new URL('../../core/src/locales/en.json', import.meta.url));

const full = () => JSON.parse(readFileSync(EN, 'utf8')) as Record<string, string>;

function loader(options?: Parameters<typeof messageSubset>[0]) {
  const load = messageSubset(options).load;
  if (typeof load !== 'function') throw new Error('the plugin must expose a load hook');
  return (id: string) => load.call(null as never, id, undefined) as string | null;
}

describe('the plugin', () => {
  it('declines every id but a catalog JSON, so no other module is rewritten', () => {
    const load = loader();
    expect(load('/somewhere/else/en.json')).toBeNull();
    expect(load(join(EN, '../index.ts'))).toBeNull();
  });

  it('rewrites the catalog past the query a bundler appends', () => {
    const load = loader();
    const withQuery = load(`${EN}?import`);
    expect(withQuery).not.toBeNull();
    expect(JSON.parse(withQuery ?? '{}')).toEqual(JSON.parse(load(EN) ?? '{}'));
  });

  it('keeps a key the scanned roots reach and drops the rest of the catalog', () => {
    const catalog = full();
    const reached = Object.keys(catalog).find((k) => !k.startsWith('lang.'));
    if (!reached) throw new Error('the catalog is empty');
    const root = tree({ 'page.tsx': `const label = t(${JSON.stringify(reached)});` });

    const kept = JSON.parse(loader({ roots: [root] })(EN) ?? '{}') as Record<string, string>;

    expect(kept[reached]).toBe(catalog[reached]);
    expect(Object.keys(kept).length).toBeLessThan(Object.keys(catalog).length);
  });

  it('keeps a key nothing reaches when the caller names it outright', () => {
    const catalog = full();
    const scanned = JSON.parse(loader()(EN) ?? '{}') as Record<string, string>;
    const dropped = Object.keys(catalog).find((k) => !(k in scanned));
    if (!dropped) throw new Error('the design system reaches every message');

    const kept = JSON.parse(loader({ keep: [dropped] })(EN) ?? '{}') as Record<string, string>;
    expect(kept[dropped]).toBe(catalog[dropped]);
  });
});
