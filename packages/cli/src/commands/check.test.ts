import { join } from 'node:path';
import { MODULE_SCHEMA_VERSION } from '@kromatv/registry';
import { describe, expect, it } from 'vitest';
import { importProblems, notificationProblems, specifierOf, unsatisfiableRanges } from './check';

const PROJECT = '/modules/tv.acme.notes';
const FILE = join(PROJECT, 'ui/src/page.tsx');

const problems = (line: string) => importProblems(FILE, `${line}\n`, PROJECT);

describe('specifierOf', () => {
  it('reads the specifier off an import, whichever quote it uses', () => {
    expect(specifierOf("import { Button } from '@kromatv/ui/kit';")).toBe('@kromatv/ui/kit');
    expect(specifierOf('import { Button } from "@kromatv/ui/kit";')).toBe('@kromatv/ui/kit');
  });

  it('reads it off a re-export and off a side-effect import', () => {
    expect(specifierOf("export { Button } from './button';")).toBe('./button');
    expect(specifierOf("import './styles.css';")).toBe('./styles.css');
  });

  it('is null for an import spread over several lines, which has no quote yet', () => {
    expect(specifierOf('import {')).toBeNull();
  });

  it('is null for a line that imports nothing', () => {
    expect(specifierOf('const a = 1;')).toBeNull();
  });

  it('does not read a quoted word as a specifier because the line starts with export', () => {
    expect(specifierOf("export const label = 'from';")).toBeNull();
  });
});

describe('importProblems', () => {
  it('names the kit’s private alias and the import that replaces it', () => {
    expect(problems("import { Button } from '#ui/components/atoms/button';")).toEqual([
      "ui/src/page.tsx: '#ui/components/atoms/button' is the kit's private alias; import from '@kromatv/ui/kit'",
    ]);
  });

  it('names a relative path that walks out of the module', () => {
    expect(problems("import { shared } from '../../../other/shared';")).toEqual([
      "ui/src/page.tsx: '../../../other/shared' reaches outside the module",
    ]);
  });

  it('leaves an import that stays inside, and a package the host provides', () => {
    expect(problems("import { schemas } from './schemas';")).toEqual([]);
    expect(problems("import { Button } from '@kromatv/ui/kit';")).toEqual([]);
  });
});

describe('notificationProblems', () => {
  const finished = {
    type: 'tv.acme.notes/note.shared',
    category: 'media' as const,
    titleKey: 'shared.title',
    bodyKey: 'shared.body',
  };
  const declaring = (...notifications: (typeof finished)[]) => ({
    schemaVersion: MODULE_SCHEMA_VERSION,
    id: 'tv.acme.notes',
    name: 'Notes',
    version: '0.1.0',
    notifications,
  });
  const worded = { 'shared.title': 'Shared', 'shared.body': '{title}' };

  it('accepts a type worded in every catalog the module ships', () => {
    expect(notificationProblems(declaring(finished), { en: worded, fr: worded })).toEqual([]);
  });

  it('names the key a catalog has no words for, and which catalog', () => {
    const found = notificationProblems(declaring(finished), {
      en: worded,
      fr: { 'shared.title': 'Partagée' },
    });

    expect(found).toEqual([
      'tv.acme.notes: tv.acme.notes/note.shared names "shared.body", which locales/fr.json lacks',
    ]);
  });

  it('takes a key the catalog only holds in its plural forms', () => {
    const plural = { 'shared.title_one': 'One', 'shared.title_other': 'Many', 'shared.body': '' };

    expect(notificationProblems(declaring(finished), { en: plural })).toEqual([]);
  });

  it('refuses a type outside the module’s namespace and one declared twice', () => {
    const stray = { ...finished, type: 'tv.acme.other/note.shared' };

    expect(notificationProblems(declaring(stray), { en: worded })[0]).toContain(
      'write tv.acme.notes/<name>',
    );
    expect(notificationProblems(declaring(finished, finished), { en: worded })[0]).toContain(
      'declared twice',
    );
  });

  it('says a module that declares types but ships no catalog has nothing to word them with', () => {
    expect(notificationProblems(declaring(finished), {})).toEqual([
      'tv.acme.notes: declares notifications but ships no locales',
    ]);
  });

  it('says nothing about a module that declares no types', () => {
    expect(notificationProblems({ ...declaring(), notifications: undefined }, {})).toEqual([]);
  });
});

describe('unsatisfiableRanges', () => {
  const project = (id: string, version: string, dependencies?: Record<string, string>) =>
    ({ dir: id, manifest: { id, version, dependencies }, server: null, ui: null }) as never;

  it('names a peer that has moved past a declared range', () => {
    const tree = [
      project('tv.kroma.torrents', '0.6.6'),
      project('tv.kroma.acquisition', '0.3.9', { 'tv.kroma.torrents': '^0.3.0' }),
    ];

    expect(unsatisfiableRanges(tree)).toEqual([
      'tv.kroma.acquisition: needs tv.kroma.torrents@^0.3.0 but this tree has 0.6.6',
    ]);
  });

  it('accepts a floor the peer clears', () => {
    const tree = [
      project('tv.kroma.torrents', '0.6.6'),
      project('tv.kroma.acquisition', '0.3.9', { 'tv.kroma.torrents': '>=0.3.0' }),
    ];

    expect(unsatisfiableRanges(tree)).toEqual([]);
  });

  it('says nothing about a dependency that lives outside this tree', () => {
    const tree = [project('tv.kroma.acquisition', '0.3.9', { 'com.someone.else': '^1.0.0' })];

    expect(unsatisfiableRanges(tree)).toEqual([]);
  });
});
