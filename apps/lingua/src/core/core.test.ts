import { describe, expect, it } from 'vitest';
import { applyEdits, parseMessages, serializeMessages } from './catalog';
import { blocks, check } from './checks';
import { catalogPath, LinguaConfig, matchCatalog, parseConfig } from './config';
import { pluralCategories, progressOf, rowsFor } from './rows';

const config = LinguaConfig.parse({
  source: 'en',
  references: ['fr'],
  locales: ['fr', 'pt-br'],
  catalogs: [
    { path: 'packages/core/src/locales/{locale}/{namespace}.json' },
    { path: 'modules/{namespace}/locales/{locale}.json' },
  ],
});

const withTemplate = (path: string) =>
  parseConfig(JSON.stringify({ source: 'en', locales: ['fr'], catalogs: [{ path }] }));

describe('lingua.json', () => {
  it('names the language and the namespace of a catalog file', () => {
    expect(matchCatalog(config, 'packages/core/src/locales/pt-br/player.json')).toEqual({
      path: 'packages/core/src/locales/pt-br/player.json',
      catalog: 0,
      locale: 'pt-br',
      namespace: 'player',
    });
    expect(matchCatalog(config, 'modules/tv.kroma.vpn/locales/fr.json')?.namespace).toBe(
      'tv.kroma.vpn',
    );
  });

  it('ignores files no template names', () => {
    expect(matchCatalog(config, 'packages/core/src/locales/catalogs.test.ts')).toBeNull();
    expect(matchCatalog(config, 'packages/core/src/locales/en/nested/x.json')).toBeNull();
  });

  it('builds a path only from a valid language and namespace', () => {
    expect(catalogPath('a/{locale}/{namespace}.json', 'de', 'nav')).toBe('a/de/nav.json');
    expect(() => catalogPath('a/{locale}/{namespace}.json', '../x', 'nav')).toThrow();
    expect(() => catalogPath('a/{locale}/{namespace}.json', 'de', '../nav')).toThrow();
  });

  it('refuses a template that escapes the repository or names a placeholder twice', () => {
    expect(withTemplate('../{locale}/{namespace}.json').ok).toBe(false);
    expect(withTemplate('{locale}/{locale}/{namespace}.json').ok).toBe(false);
    expect(withTemplate('x/{locale}/{namespace}.json').ok).toBe(true);
  });

  it('says why a file is not usable', () => {
    expect(parseConfig('{')).toEqual({ ok: false, error: 'lingua.json is not JSON' });
    expect(parseConfig('{"source":"EN","locales":["fr"],"catalogs":[]}')).toMatchObject({
      ok: false,
    });
  });
});

describe('catalog files', () => {
  it('writes what the formatter writes', () => {
    const text = '{\n  "a.b": "Héllo",\n  "a.c": "{n} items"\n}\n';

    expect(serializeMessages(parseMessages(text) ?? {})).toBe(text);
  });

  it('reads only a flat map of strings', () => {
    expect(parseMessages('{"a": {"b": "c"}}')).toBeNull();
    expect(parseMessages('nope')).toBeNull();
  });

  it('keeps every existing key in place and slots a new one after its source neighbour', () => {
    const base = { 'x.a': 'A', 'x.c': 'C' };

    const merged = applyEdits(base, { 'x.b': 'B', 'x.c': 'C2', 'x.z': 'Z' }, [
      'x.a',
      'x.b',
      'x.c',
      'x.z',
    ]);

    expect(Object.entries(merged)).toEqual([
      ['x.a', 'A'],
      ['x.b', 'B'],
      ['x.c', 'C2'],
      ['x.z', 'Z'],
    ]);
  });
});

describe('rows', () => {
  const source = { 'b.count': '{count} films', 'b.count_one': '{count} film', 'b.title': 'Browse' };

  it('asks a language for each plural form it has, beside the base', () => {
    expect(rowsFor(source, 'en').map((r) => [r.key, r.plural])).toEqual([
      ['b.count', 'other'],
      ['b.count_one', 'one'],
      ['b.title', null],
    ]);
    expect(rowsFor(source, 'pl').map((r) => r.key)).toEqual([
      'b.count',
      'b.count_one',
      'b.count_few',
      'b.count_many',
      'b.title',
    ]);
    expect(rowsFor(source, 'vi').map((r) => r.key)).toEqual(['b.count', 'b.title']);
  });

  it('shows a form the source lacks with the base text', () => {
    expect(rowsFor(source, 'pl').find((r) => r.key === 'b.count_few')?.source).toBe(
      '{count} films',
    );
  });

  it('asks only for the forms a count below a thousand takes', () => {
    expect(pluralCategories('fr')).toEqual(['one', 'other']);
    expect(pluralCategories('cs')).toEqual(['one', 'few', 'other']);
    expect(pluralCategories('ar')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
  });

  it('counts a blank message as missing', () => {
    expect(
      progressOf(rowsFor(source, 'vi'), { 'b.count': '{count} phim', 'b.title': ' ' }),
    ).toEqual({ done: 1, total: 2 });
  });
});

describe('checks', () => {
  const keys = new Set(['p.title', 'p.play']);

  it('blocks a placeholder the source does not have', () => {
    const issues = check('Lire {name}', { source: 'Play {title}', keys, plural: false });

    expect(issues).toContainEqual({ level: 'error', code: 'unknown-token', detail: 'name' });
    expect(issues).toContainEqual({ level: 'warning', code: 'missing-token', detail: 'title' });
    expect(blocks(issues)).toBe(true);
  });

  it('lets a plural form spell out its count', () => {
    expect(check('Un film', { source: '{count} film', keys, plural: true })).toEqual([]);
  });

  it('blocks a reference to a key outside the namespace', () => {
    expect(check('$t(p.play) now', { source: 'x', keys, plural: false })).toEqual([]);
    expect(check('$t(q.play)', { source: 'x', keys, plural: false })).toEqual([
      { level: 'error', code: 'unknown-ref', detail: 'q.play' },
    ]);
  });

  it('blocks control characters but keeps line breaks', () => {
    expect(check('a\nb', { source: 'a b', keys, plural: false })).toEqual([]);
    expect(blocks(check('a\u0007b', { source: 'a b', keys, plural: false }))).toBe(true);
  });
});
