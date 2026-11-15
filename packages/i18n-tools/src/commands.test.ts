import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { check, fillCommand, moveCommand, status, sync, todoCommand } from './commands.ts';
import { newCommand, removeCommand, renameCommand, unusedCommand } from './key-commands.ts';
import { read, removeSets, setOf } from './fixture.ts';
import type { CatalogSet } from './set.ts';

afterEach(removeSets);

function app(): CatalogSet {
  return setOf(
    {
      'i18n.json': { source: 'fr' },
      'fr/lang.json': { 'lang.fr': 'Français', 'lang.de': 'Allemand' },
      'fr/nav.json': { 'nav.home': 'Accueil', 'nav.back': 'Retour' },
      'de/lang.json': { 'lang.de': 'Deutsch' },
      'de/nav.json': { 'nav.home': 'Start' },
    },
    { source: 'fr', locales: { de: { stage: 'beta' } } },
  );
}

function run(command: typeof status, set: CatalogSet, args: string[] = []) {
  const lines: string[] = [];
  const context = {
    sets: [set],
    root: set.dir,
    bin: 'kroma i18n',
    print: (text: string) => lines.push(text),
  };
  const code = command(context, args);
  return { code, text: lines.join('\n') };
}

describe('status', () => {
  it('shows every language with its stage and how far it has come', () => {
    const { text } = run(status, app());

    expect(text).toMatch(/fr {2}Français +source +4 +0 +0 +0 +0 +100%/);
    expect(text).toMatch(/de {2}Deutsch +beta +2 +0 +0 +0 +2 +50\.0%/);
  });

  it('shows one language file by file, with the keys left to do', () => {
    const { text } = run(status, app(), ['de']);

    expect(text).toContain(
      'de  Deutsch: beta, 50.0% of 4 messages (0 outdated, 2 missing, 0 unreviewed)',
    );
    expect(text).toContain('Missing (2)\n  lang.fr\n  nav.back');
  });

  it('gives the same report as data', () => {
    const { text } = run(status, app(), ['de', '--json']);

    expect(JSON.parse(text).languages[0]).toMatchObject({
      locale: 'de',
      stage: 'beta',
      missing: 2,
      coverage: 0.5,
    });
  });

  it('gives the overview as a markdown table', () => {
    const { text } = run(status, app(), ['--md']);

    expect(text).toContain('| `de` Deutsch | beta | 2 | 0 | 0 | 0 | 2 | 50.0% |');
  });

  it('refuses a language nobody started, and says how to start it', () => {
    expect(() => run(status, app(), ['it'])).toThrow('kroma i18n add it');
  });
});

describe('check', () => {
  it('fails until the locks are written, then holds', () => {
    const set = app();

    const before = run(check, set);
    run(sync, set);
    const after = run(check, set);

    expect([before.code, after.code]).toEqual([1, 0]);
    expect(before.text).toContain('app  de/i18n.lock: out of date: run `kroma i18n sync`');
  });
});

describe('todo and fill', () => {
  it('hand a translator what is left and write the answer back', () => {
    const set = app();
    const answers = join(set.dir, '..', `answers-${Date.now()}.json`);

    const { text } = run(todoCommand, set, ['de']);
    writeFileSync(answers, JSON.stringify({ app: { 'nav.back': 'Zurück' } }));
    const filled = run(fillCommand, set, ['de', answers]);

    expect(Object.keys(JSON.parse(text).app)).toEqual(['lang.fr', 'nav.back']);
    expect(filled.code).toBe(0);
    expect(read(set, 'de/nav.json')).toEqual({ 'nav.home': 'Start', 'nav.back': 'Zurück' });
  });
});

describe('todo and fill, for a machine', () => {
  it('hand over a sitting at a time and keep what comes back apart as unreviewed', () => {
    const set = app();
    const answers = join(set.dir, '..', `machine-${Date.now()}.json`);

    const { text } = run(todoCommand, set, ['de', '--limit', '1']);
    writeFileSync(answers, JSON.stringify({ app: { 'nav.back': 'Zurück' } }));
    run(fillCommand, set, ['de', answers, '--machine']);
    const report = run(status, set, ['de', '--json']);

    expect(Object.keys(JSON.parse(text).app)).toHaveLength(1);
    expect(JSON.parse(report.text).languages[0].unreviewed).toBe(1);
  });
});

describe('unused', () => {
  it('reads the source files beside the catalogs and lists what none of them names', () => {
    const set = app();
    writeFileSync(join(set.dir, 'page.tsx'), "t('nav.home')");
    mkdirSync(join(set.dir, 'node_modules'));
    writeFileSync(join(set.dir, 'node_modules', 'dep.js'), "t('nav.back')");

    const { text } = run(unusedCommand, set, ['--json']);

    expect(JSON.parse(text)).toEqual(['nav.back']);
  });
});

describe('new, rename and rm', () => {
  it('write a message, rename it in the catalogs and the code, then delete it', () => {
    const set = app();
    const page = join(set.dir, 'page.tsx');
    writeFileSync(page, "t('nav.search')");

    const created = run(newCommand, set, ['nav.search', 'Recherche', 'de=Suche']);
    const renamed = run(renameCommand, set, ['nav.search', 'nav.find']);
    const before = read(set, 'de/nav.json');
    const removed = run(removeCommand, set, ['nav.find']);

    expect(created.text).toBe('nav.search written to nav.json in fr, de');
    expect(renamed.text).toBe(
      'nav.search is now nav.find in de, fr\n1 source files updated\n  page.tsx',
    );
    expect(readFileSync(page, 'utf8')).toBe("t('nav.find')");
    expect(before['nav.find']).toBe('Suche');
    expect(removed.text).toBe('nav.find removed from de, fr');
  });

  it('refuse a text that is not written as locale=text', () => {
    expect(() => run(newCommand, app(), ['nav.search', 'Recherche', 'Suche'])).toThrow(
      'is not <locale>=<text>',
    );
  });
});

describe('mv', () => {
  it('says where the messages went, and how many', () => {
    const { text } = run(moveCommand, app(), ['nav.back', 'nav/history.json']);

    expect(text).toBe('Moved to nav/history.json in every language: 1 of them.');
  });
});
