import { readdirSync } from 'node:fs';
import {
  fallbackChain,
  generalForm,
  labelKey,
  namespaceOf,
  namespaceOfFile,
  parentTags,
  tokensIn,
  variablesOf,
} from '@kromatv/i18n/model';
import { sameLock } from './lock.ts';
import { NOTES_FILE, readNotes, strayNotes } from './notes.ts';
import {
  type CatalogSet,
  catalogName,
  isLocaleTag,
  localesOf,
  lockName,
  readFiles,
} from './set.ts';
import { fileOf, inspectLocale, type LocaleStatus, readSource, type Source } from './status.ts';

/** Something the check refuses, and where. */
export interface Problem {
  readonly set: string;
  readonly where: string;
  readonly message: string;
}

const DEFAULT_BIN = 'bun run i18n';

// One set under check, and how the command that fixes a problem is spelled.
interface Checked {
  readonly set: CatalogSet;
  readonly source: Source;
  readonly bin: string;
}

const REF = /\$t\(\s*([\w.-]+)\s*\)/g;
const LISTED = 12;

function listed(keys: readonly string[]): string {
  const shown = keys.slice(0, LISTED).join(', ');
  return keys.length > LISTED ? `${shown} and ${keys.length - LISTED} more` : shown;
}

function misplaced({ set, source, bin }: Checked, file: string, key: string): string | null {
  if (set.layout === 'flat') return null;
  if (namespaceOf(key) !== namespaceOfFile(file)) {
    return `${key} is not a message of ${namespaceOfFile(file)}`;
  }
  const home = fileOf(set, source, key);
  if (home === file) return null;
  return `${key} belongs in ${home}.json, where ${source.locale} has it: run \`${bin} sync\``;
}

function quoteProblems(set: CatalogSet, source: Source, key: string, template: string): string[] {
  const problems: string[] = [];
  for (const [, quoted = ''] of template.matchAll(REF)) {
    if (source.catalog[quoted] === undefined) {
      problems.push(`${key} quotes ${quoted}, which is no message`);
    } else if (
      set.layout === 'folder' &&
      fileOf(set, source, quoted) !== fileOf(set, source, key)
    ) {
      problems.push(
        `${key} quotes ${quoted}: a message only quotes its own file, the one it loads with`,
      );
    }
  }
  return problems;
}

function fileProblems(checked: Checked, locale: string): Problem[] {
  const { set, source } = checked;
  const problems: Problem[] = [];
  const written = new Map<string, string>();
  for (const [file, catalog] of readFiles(set, locale)) {
    const where = catalogName(set, locale, file);
    const report = (message: string | null) => {
      if (message !== null) problems.push({ set: set.name, where, message });
    };
    for (const [key, template] of Object.entries(catalog)) {
      const twin = written.get(key);
      if (twin !== undefined) report(`${key} is also in ${twin}.json`);
      written.set(key, file);
      report(misplaced(checked, file, key));
      if (template === '' && locale !== source.locale) {
        report(`${key} is empty: leave an untranslated message out instead`);
      }
      for (const problem of quoteProblems(set, source, key, template)) report(problem);
    }
  }
  return problems;
}

function translationProblems({ set, source, bin }: Checked, status: LocaleStatus): Problem[] {
  const problems: Problem[] = [];
  const report = (key: string, message: string) =>
    problems.push({
      set: set.name,
      where: catalogName(set, status.locale, fileOf(set, source, key)),
      message,
    });
  for (const key of status.strays) {
    report(key, `${key} is no message of ${source.locale}: run \`${bin} prune\``);
  }
  for (const [key, translation] of status.messages) {
    const original = source.messages.get(key);
    if (!original) continue;
    if (generalForm(translation) === undefined) {
      report(key, `${Object.keys(translation.forms).join(', ')} has no ${key} beside it`);
    }
    const known = variablesOf(original);
    for (const [form, template] of Object.entries(translation.forms)) {
      const unknown = tokensIn(template).filter((name) => !known.has(name));
      if (unknown.length > 0) {
        report(key, `${form} names {${unknown.join('}, {')}}, which ${source.locale} never passes`);
      }
    }
  }
  return problems;
}

function stageProblems({ set, bin }: Checked, status: LocaleStatus): Problem[] {
  const problems: Problem[] = [];
  const where = status.locale;
  if (status.stage === 'stable' && status.missing.length > 0) {
    problems.push({
      set: set.name,
      where,
      message: `stable, and missing ${status.missing.length}: ${listed(status.missing)}`,
    });
  }
  if (status.stage === 'stable' && status.outdated.length > 0) {
    problems.push({
      set: set.name,
      where,
      message: `stable, and outdated in ${status.outdated.length}: ${listed(status.outdated)}. Retranslate them, or run \`${bin} confirm ${status.locale}\` where the translation still holds`,
    });
  }
  if (!sameLock(status.lock, status.nextLock)) {
    problems.push({
      set: set.name,
      where: lockName(set, status.locale),
      message: `out of date: run \`${bin} sync\``,
    });
  }
  return problems;
}

function labelProblems(set: CatalogSet, source: Source, locale: string): Problem[] {
  if (source.catalog[labelKey(source.locale)] === undefined) return [];
  const key = labelKey(locale);
  const file = fileOf(set, source, key);
  if (readFiles(set, locale).get(file)?.[key]) return [];
  return [
    {
      set: set.name,
      where: catalogName(set, locale, file),
      message: `${key} is missing: a language names itself, in its own words`,
    },
  ];
}

// A set that keeps a folder per language reads nothing else. A `de.json` left
// beside the folders, from the one-file layout, holds messages no reader gets.
function strayCatalogs(set: CatalogSet): Problem[] {
  if (set.layout === 'flat') return [];
  return readdirSync(set.dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length))
    .filter(isLocaleTag)
    .map((locale) => ({
      set: set.name,
      where: `${locale}.json`,
      message: `is not read beside the language folders: move its messages into ${locale}/`,
    }));
}

/** Everything wrong with one set: its files, its translations, and the
 *  promise each locale's stage makes. */
export function checkSet(set: CatalogSet, bin: string = DEFAULT_BIN): Problem[] {
  const locales = localesOf(set);
  if (!locales.includes(set.project.source)) {
    return [
      {
        set: set.name,
        where: set.project.source,
        message: 'the source language has no catalog',
      },
    ];
  }
  const source = readSource(set);
  const checked: Checked = { set, source, bin };
  const problems: Problem[] = strayCatalogs(set);
  for (const locale of locales) {
    if (!isLocaleTag(locale)) {
      problems.push({ set: set.name, where: locale, message: 'is not a language tag' });
      continue;
    }
    problems.push(...fileProblems(checked, locale), ...labelProblems(set, source, locale));
    if (locale === source.locale) continue;
    const status = inspectLocale(set, source, locale);
    problems.push(...translationProblems(checked, status), ...stageProblems(checked, status));
  }
  return problems;
}

/** What a policy file names that the folders do not hold. Asked of the set
 *  that owns its policy; a set handed another's is not held to it. */
export function policyProblems(set: CatalogSet): Problem[] {
  const locales = new Set(localesOf(set));
  const problems: Problem[] = [];
  const unknown = (locale: string, role: string) => {
    if (!locales.has(locale)) {
      problems.push({
        set: set.name,
        where: 'i18n.json',
        message: `${role} ${locale} has no folder`,
      });
    }
  };
  if (set.project.fallback !== undefined) unknown(set.project.fallback, 'the fallback');
  for (const [locale, policy] of Object.entries(set.project.locales ?? {})) {
    unknown(locale, 'the locale');
    if (policy.fallback !== undefined) unknown(policy.fallback, `the fallback of ${locale},`);
  }
  for (const locale of locales) {
    const chain = fallbackChain(set.project, locale, (code) => locales.has(code));
    const region = parentTags(locale).find((parent) => locales.has(parent));
    if (region && !chain.includes(region)) {
      problems.push({
        set: set.name,
        where: 'i18n.json',
        message: `${locale} never falls back to ${region}`,
      });
    }
  }
  return problems;
}

function noteProblems(set: CatalogSet): Problem[] {
  if (!localesOf(set).includes(set.project.source)) return [];
  return strayNotes(readNotes(set), readSource(set)).map((about) => ({
    set: set.name,
    where: NOTES_FILE,
    message: `${about} is no message, and no message starts with it`,
  }));
}

/** The whole workspace. The first set owns the policy the others follow. */
export function checkWorkspace(sets: readonly CatalogSet[], bin: string = DEFAULT_BIN): Problem[] {
  const [primary] = sets;
  if (!primary) return [];
  return [
    ...policyProblems(primary),
    ...sets.flatMap((set) => [...checkSet(set, bin), ...noteProblems(set)]),
  ];
}
