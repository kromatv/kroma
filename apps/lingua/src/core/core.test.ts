import { describe, expect, it } from 'vitest';
import { parseCatalog, parseMessages, renderCatalog } from './catalog';
import { blocks, check } from './checks';
import { parseConfig, pathOf, placeOf } from './config';
import { notesFor, parseNotes } from './notes';
import { withDraftLocale } from './policy';
import { pluralCategories, rowsFor } from './rows';

const ROOT = 'packages/core/src/locales';

const config = (value: object) => parseConfig(JSON.stringify(value)).ok;

describe('lingua.json', () => {
  it('names the project folder and the address the devtools link to', () => {
    const text = JSON.stringify({ url: 'https://lingua.kroma.tv', projects: [{ path: ROOT }] });

    expect(parseConfig(text)).toEqual({
      ok: true,
      config: { url: 'https://lingua.kroma.tv', projects: [{ path: ROOT }] },
    });
  });

  it('refuses a folder outside the repository, a plain-http address and a second project', () => {
    expect(config({ projects: [{ path: '../locales' }] })).toBe(false);
    expect(config({ projects: [{ path: '/locales' }] })).toBe(false);
    expect(config({ url: 'http://lingua.test', projects: [{ path: 'l' }] })).toBe(false);
    expect(config({ projects: [{ path: 'a' }, { path: 'b' }] })).toBe(false);
  });

  it('says why a file is not usable', () => {
    expect(parseConfig('{')).toEqual({ ok: false, error: 'lingua.json is not JSON' });
    expect(parseConfig('{"projects":[]}')).toMatchObject({ ok: false });
  });
});

describe('places', () => {
  it('names the language and the file of a catalog, sub-folders included', () => {
    expect(placeOf(ROOT, `${ROOT}/pt-BR/admin/backup.json`)).toEqual({
      kind: 'catalog',
      locale: 'pt-BR',
      file: 'admin/backup',
    });
    expect(placeOf(ROOT, `${ROOT}/fr/nav.json`)?.file).toBe('nav');
  });

  it('tells the policy, the notes and a lock from a catalog', () => {
    expect(placeOf(ROOT, `${ROOT}/i18n.json`)?.kind).toBe('policy');
    expect(placeOf(ROOT, `${ROOT}/notes.json`)?.kind).toBe('notes');
    expect(placeOf(ROOT, `${ROOT}/en/i18n.lock`)).toEqual({ kind: 'lock', locale: 'en', file: '' });
  });

  it('ignores what is not a file of the project', () => {
    expect(placeOf(ROOT, `${ROOT}/catalogs.test.ts`)).toBeNull();
    expect(placeOf(ROOT, `${ROOT}/en/catalogs.ts`)).toBeNull();
    expect(placeOf(ROOT, `${ROOT}/Nope/nav.json`)).toBeNull();
    expect(placeOf(ROOT, 'packages/core/src/other/en/nav.json')).toBeNull();
  });

  it('builds the path of each kind of file back', () => {
    const place = { kind: 'catalog', locale: 'de', file: 'admin/backup' } as const;

    expect(pathOf(ROOT, place)).toBe(`${ROOT}/de/admin/backup.json`);
    expect(pathOf(ROOT, { kind: 'lock', locale: 'de', file: '' })).toBe(`${ROOT}/de/i18n.lock`);
  });
});

describe('catalog files', () => {
  it('writes what the formatter writes', () => {
    const text = '{\n  "a.b": "Héllo",\n  "a.c": "{n} items"\n}\n';

    expect(renderCatalog(parseMessages(text) ?? {})).toBe(text);
  });

  it('keeps the schema pointer out of the messages and first in the file', () => {
    const text = '{\n  "$schema": "../catalog.json",\n  "a.b": "B"\n}\n';

    const read = parseCatalog(text);

    expect(read).toEqual({ messages: { 'a.b': 'B' }, pointer: '../catalog.json' });
    expect(renderCatalog(read?.messages ?? {}, read?.pointer)).toBe(text);
  });

  it('reads only a flat map of strings', () => {
    expect(parseMessages('{"a": {"b": "c"}}')).toBeNull();
    expect(parseMessages('nope')).toBeNull();
  });
});

describe('notes', () => {
  it('gives a message every note about it, the widest first and its own last', () => {
    const notes = parseNotes(
      JSON.stringify({ 'p.play': 'A verb.', '*': 'Informal.', 'p.': 'The player.', 'q.': 'No.' }),
    );

    expect(notesFor(notes, 'p.play')).toEqual(['Informal.', 'The player.', 'A verb.']);
  });

  it('reads a missing or broken file as no notes', () => {
    expect(parseNotes(undefined).size).toBe(0);
    expect(parseNotes('[1]').size).toBe(0);
  });
});

describe('i18n.json', () => {
  it('adds a draft after the listed languages and leaves every other line alone', () => {
    const text =
      '{\n  "$schema": "../schema.json",\n  "source": "fr",\n  "fallback": "en",\n  "locales": {\n    "en": { "stage": "stable" }\n  }\n}\n';

    expect(withDraftLocale(text, 'de')).toBe(
      '{\n  "$schema": "../schema.json",\n  "source": "fr",\n  "fallback": "en",\n  "locales": {\n    "en": { "stage": "stable" },\n    "de": { "stage": "draft" }\n  }\n}\n',
    );
  });

  it('opens the locales a policy did not list yet', () => {
    expect(withDraftLocale('{\n  "source": "en"\n}\n', 'de')).toBe(
      '{\n  "source": "en",\n  "locales": {\n    "de": { "stage": "draft" }\n  }\n}\n',
    );
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
