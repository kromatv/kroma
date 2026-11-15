import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { labelKey } from '@kromatv/i18n/model';
import { z } from 'zod';
import { checkWorkspace } from './check.ts';
import { addLocale, fill, markMachine, move, prune, syncSet } from './edit.ts';
import { confirm } from './confirm.ts';
import { asJson, detail, type Names, overview, overviewMarkdown } from './report.ts';
import { type CatalogSet, keepsPolicy, localesOf, readFiles } from './set.ts';
import { inspectWorkspace } from './status.ts';
import { type TodoEntry, todo } from './todo.ts';
import { writeTypes } from './types.ts';

/** Where a command writes what it has to say. */
export type Print = (text: string) => void;

/** What a command runs over, and how it speaks. */
export interface Context {
  readonly sets: readonly CatalogSet[];
  /** The checkout the sets belong to, where source files are looked for. */
  readonly root: string;
  /** How the caller is spelled in a hint: `bun run i18n`, `kroma i18n`. */
  readonly bin: string;
  readonly print: Print;
}

const SHOWN_KEYS = 30;

const Translations = z.record(z.string(), z.record(z.string(), z.string()));

/** The set whose policy the others follow: the first one. */
export function primary(sets: readonly CatalogSet[]): CatalogSet {
  const [first] = sets;
  if (!first) {
    throw new Error('no catalogs in this workspace');
  }
  return first;
}

function endonyms(sets: readonly CatalogSet[]): Names {
  const app = primary(sets);
  return (locale) => {
    const key = labelKey(locale);
    for (const catalog of readFiles(app, locale).values()) {
      if (catalog[key]) {
        return catalog[key];
      }
    }
    return '';
  };
}

function known({ sets, bin }: Context, locale: string | undefined): string {
  if (locale === undefined) {
    throw new Error('name a locale, like de or pt-BR');
  }
  if (!sets.some((set) => localesOf(set).includes(locale))) {
    throw new Error(`no language "${locale}" here: start it with \`${bin} add ${locale}\``);
  }
  return locale;
}

export function status(context: Context, args: string[]): number {
  const { sets, print } = context;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      md: { type: 'boolean' },
      all: { type: 'boolean' },
    },
  });
  const languages = inspectWorkspace(sets);
  const [locale] = positionals;
  const picked =
    locale === undefined
      ? languages
      : languages.filter((language) => language.locale === known(context, locale));
  if (values.json) {
    print(JSON.stringify(asJson(picked), null, 2));
  } else if (values.md) {
    print(overviewMarkdown(picked, endonyms(sets)));
  } else if (locale === undefined) {
    print(overview(picked, endonyms(sets)));
  } else {
    const limit = values.all ? Number.POSITIVE_INFINITY : SHOWN_KEYS;
    for (const language of picked) {
      print(detail(language, endonyms(sets), limit));
    }
  }
  return 0;
}

export function check(context: Context, _args: string[]): number {
  const { sets, print } = context;
  const problems = checkWorkspace(sets, context.bin);
  for (const problem of problems) {
    print(`${problem.set}  ${problem.where}: ${problem.message}`);
  }
  if (problems.length === 0) {
    print('The catalogs hold.');
  }
  return problems.length === 0 ? 0 : 1;
}

export function sync(context: Context, _args: string[]): number {
  const { sets, print } = context;
  let moved = 0;
  for (const set of sets) {
    const { mirrored, locked } = syncSet(set);
    for (const locale of mirrored) {
      print(`${set.name}  ${locale}: files follow ${set.project.source}`);
    }
    for (const locale of locked) {
      print(`${set.name}  ${locale}: lock updated`);
    }
    moved += mirrored.length + locked.length;
  }
  writeTypes(sets);
  if (moved === 0) {
    print('Already in sync.');
  }
  return 0;
}

export function types(context: Context, _args: string[]): number {
  const { sets, print } = context;
  const moved = writeTypes(sets);
  for (const path of moved) {
    print(`wrote ${path}`);
  }
  if (moved.length === 0) {
    print('The key types are current.');
  }
  return 0;
}

export function add(context: Context, args: string[]): number {
  const { sets, print } = context;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { name: { type: 'string' } },
  });
  const [locale] = positionals;
  if (locale === undefined) {
    throw new Error('name the locale to add, like de or pt-BR');
  }
  const app = primary(sets);
  const added = addLocale(app, locale, values.name);
  sync({ ...context, print: () => {} }, []);
  const { bin } = context;
  const where =
    app.layout === 'flat' ? `${app.dir}/${added.locale}.json` : `${app.dir}/${added.locale}`;
  print(`${added.locale}  ${added.name}`.trimEnd() + `: started in ${where}`);
  print(`Translate it:  ${bin} todo ${added.locale} --out ${added.locale}.todo.json`);
  if (keepsPolicy(app)) {
    print('Ship it:       set its stage to "beta" in i18n.json');
  }
  return 0;
}

function todoFor(
  sets: readonly CatalogSet[],
  locale: string,
  only: string | undefined,
  prefixes: readonly string[],
): Record<string, Record<string, TodoEntry>> {
  const reference = primary(sets).project.fallback;
  const work: Record<string, Record<string, TodoEntry>> = {};
  for (const set of sets) {
    if (only !== undefined && set.name !== only) {
      continue;
    }
    if (locale === set.project.source) {
      continue;
    }
    const entries = todo(set, locale, { reference, prefixes });
    if (Object.keys(entries).length > 0) {
      work[set.name] = entries;
    }
  }
  return work;
}

// The first `limit` messages across the sets, so a translator can take a
// language a sitting at a time.
function firstOf(
  work: Readonly<Record<string, Record<string, TodoEntry>>>,
  limit: number,
): Record<string, Record<string, TodoEntry>> {
  const taken: Record<string, Record<string, TodoEntry>> = {};
  let left = limit;
  for (const [set, entries] of Object.entries(work)) {
    const some = Object.entries(entries).slice(0, Math.max(left, 0));
    if (some.length > 0) {
      taken[set] = Object.fromEntries(some);
    }
    left -= some.length;
  }
  return taken;
}

export function todoCommand(context: Context, args: string[]): number {
  const { sets, print } = context;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { set: { type: 'string' }, out: { type: 'string' }, limit: { type: 'string' } },
  });
  const [locale, ...prefixes] = positionals;
  const all = todoFor(sets, known(context, locale), values.set, prefixes);
  const work = values.limit === undefined ? all : firstOf(all, Number(values.limit));
  const text = JSON.stringify(work, null, 2);
  if (values.out === undefined) {
    print(text);
  } else {
    writeFileSync(values.out, `${text}\n`);
    const count = Object.values(work).reduce((sum, set) => sum + Object.keys(set).length, 0);
    print(`${count} messages to translate, written to ${values.out}`);
  }
  return 0;
}

export function fillCommand(context: Context, args: string[]): number {
  const { sets, print } = context;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { machine: { type: 'boolean' } },
  });
  const [locale, file] = positionals;
  if (locale === undefined || file === undefined) {
    throw new Error(`usage: ${context.bin} fill <locale> <file.json> [--machine]`);
  }
  const translations = Translations.parse(JSON.parse(readFileSync(file, 'utf8')));
  let refused = 0;
  for (const [name, entries] of Object.entries(translations)) {
    const set = sets.find((candidate) => candidate.name === name);
    if (!set) {
      throw new Error(`${file} names "${name}", which is no set of this workspace`);
    }
    const { written, rejected } = fill(set, locale, entries);
    if (values.machine) {
      syncSet(set);
      markMachine(set, locale, written);
    }
    print(`${name}  ${locale}: ${written.length} written`);
    for (const key of rejected) {
      print(`${name}  ${locale}: ${key} is no message, left out`);
    }
    refused += rejected.length;
  }
  sync({ ...context, print: () => {} }, []);
  return refused === 0 ? 0 : 1;
}

/** `confirm <locale> [prefix...]`: the translations hold as they read, the
 *  outdated ones and the ones a machine wrote. */
export function confirmCommand(context: Context, args: string[]): number {
  const { sets, print } = context;
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const [locale, ...prefixes] = positionals;
  const target = known(context, locale);
  let total = 0;
  for (const set of sets) {
    if (target === set.project.source || !localesOf(set).includes(target)) {
      continue;
    }
    const confirmed = confirm(set, target, { prefixes });
    for (const key of confirmed) {
      print(`${set.name}  ${target}: ${key} holds`);
    }
    total += confirmed.length;
  }
  if (total === 0) {
    print('Nothing outdated or unreviewed to confirm.');
  }
  return 0;
}

export function pruneCommand(context: Context, args: string[]): number {
  const { sets, print } = context;
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const [only] = positionals;
  let total = 0;
  for (const set of sets) {
    for (const locale of localesOf(set)) {
      if (locale === set.project.source || (only !== undefined && locale !== only)) {
        continue;
      }
      const removed = prune(set, locale);
      for (const key of removed) {
        print(`${set.name}  ${locale}: removed ${key}`);
      }
      total += removed.length;
    }
  }
  sync({ ...context, print: () => {} }, []);
  if (total === 0) {
    print('Nothing to prune.');
  }
  return 0;
}

export function moveCommand(context: Context, args: string[]): number {
  const { sets, print } = context;
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const [prefix, file] = positionals;
  if (prefix === undefined || file === undefined) {
    throw new Error(
      `usage: ${context.bin} mv <key-prefix> <file>, like: mv admin.backup admin/backup`,
    );
  }
  const app = primary(sets);
  const moved = move(app, prefix, file.replace(/\.json$/, ''));
  print(
    moved.length === 0
      ? `No message starts with ${prefix}, or they are in ${file} already.`
      : `Moved to ${file} in every language: ${moved.length} of them.`,
  );
  return 0;
}
