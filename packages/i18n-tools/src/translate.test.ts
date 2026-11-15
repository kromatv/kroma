import { afterEach, describe, expect, it } from 'vitest';
import { confirm } from './confirm.ts';
import { read, removeSets, setOf, write } from './fixture.ts';
import { inspectLocale, readSource } from './status.ts';
import { translate, type TranslationRequest } from './translate.ts';

afterEach(removeSets);

const FR = {
  'fr/nav.json': {
    'nav.home': 'Accueil',
    'nav.count': '{count} pages',
    'nav.count_one': 'Une page',
  },
};

function answering(answers: Record<string, string>) {
  const seen: TranslationRequest[] = [];
  const translator = (request: TranslationRequest) => {
    seen.push(request);
    const asked = Object.keys(request.messages);
    return Promise.resolve(
      Object.fromEntries(
        Object.entries(answers).filter(([key]) => asked.some((base) => key.startsWith(base))),
      ),
    );
  };
  return { translator, seen };
}

describe('translate', () => {
  it('writes what the translator answers and marks it as unreviewed', async () => {
    const set = setOf(FR);
    const { translator } = answering({ 'nav.home': 'Start', 'nav.count': '{count} Seiten' });

    const done = await translate(set, 'de', translator);

    expect(done.written.sort()).toEqual(['nav.count', 'nav.home']);
    expect(read(set, 'de/nav.json')).toEqual({
      'nav.count': '{count} Seiten',
      'nav.home': 'Start',
    });
    expect([...inspectLocale(set, readSource(set), 'de').unreviewed].sort()).toEqual([
      'nav.count',
      'nav.home',
    ]);
  });

  it('tells the translator the plural categories of the language it writes', async () => {
    const set = setOf(FR);
    const { translator, seen } = answering({});

    await translate(set, 'ru', translator);

    expect(seen[0]?.categories).toEqual(expect.arrayContaining(['one', 'few', 'many', 'other']));
    expect(seen[0]?.sourceLocale).toBe('fr');
  });

  it('refuses an answer that was not asked for, is empty, or invents a placeholder', async () => {
    const set = setOf(FR);
    const translator = () =>
      Promise.resolve({ 'nav.gone': 'x', 'nav.home': ' ', 'nav.count': '{total} Seiten' });

    const done = await translate(set, 'de', translator);

    expect(done.written).toEqual([]);
    expect(done.refused).toEqual([
      { key: 'nav.gone', why: 'was not asked for' },
      { key: 'nav.home', why: 'is empty' },
      { key: 'nav.count', why: 'names {total}' },
    ]);
  });

  it('asks in batches, and stops at the limit', async () => {
    const set = setOf(FR);
    const { translator, seen } = answering({ 'nav.home': 'Start', 'nav.count': '{count} Seiten' });

    const done = await translate(set, 'de', translator, { batch: 1, limit: 1 });

    expect([seen.length, done.asked]).toEqual([1, 1]);
  });

  it('asks again for a message whose source moved, with what the language says today', async () => {
    const set = setOf(FR);
    await translate(set, 'de', answering({ 'nav.home': 'Start' }).translator);
    write(set, 'fr/nav.json', { ...FR['fr/nav.json'], 'nav.home': 'Maison' });
    const { translator, seen } = answering({});

    await translate(set, 'de', translator, { prefixes: ['nav.home'] });

    expect(seen[0]?.messages['nav.home']).toMatchObject({ state: 'outdated', current: 'Start' });
  });
});

describe('a machine translation', () => {
  it('stops being unreviewed once a person edits it', async () => {
    const set = setOf(FR);
    await translate(set, 'de', answering({ 'nav.home': 'Start' }).translator);

    write(set, 'de/nav.json', { 'nav.home': 'Startseite' });

    expect(inspectLocale(set, readSource(set), 'de').unreviewed).toEqual([]);
  });

  it('stops being unreviewed once someone says it holds', async () => {
    const set = setOf(FR);
    await translate(set, 'de', answering({ 'nav.home': 'Start' }).translator);

    const reviewed = confirm(set, 'de', { prefixes: [] });

    expect(reviewed).toEqual(['nav.home']);
    expect(inspectLocale(set, readSource(set), 'de').unreviewed).toEqual([]);
  });
});
