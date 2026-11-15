import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { type Context, primary } from './commands.ts';
import { createMessage, removeMessage, renameMessage, rewriteLiterals } from './keys.ts';
import type { CatalogSet } from './set.ts';
import { readSource } from './status.ts';
import { writeTypes } from './types.ts';
import { namedInFiles, unusedMessages } from './usage.ts';

const TEXT_PAIR = /^([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)=([\s\S]*)$/;

function picked(sets: readonly CatalogSet[], name: string | undefined): CatalogSet {
  if (name === undefined) return primary(sets);
  const set = sets.find((candidate) => candidate.name === name);
  if (!set) throw new Error(`"${name}" is no set of this workspace`);
  return set;
}

export function newCommand(context: Context, args: string[]): number {
  const { sets, print } = context;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { set: { type: 'string' }, file: { type: 'string' } },
  });
  const [key, text, ...pairs] = positionals;
  if (key === undefined || text === undefined) {
    throw new Error(
      `usage: ${context.bin} new <key> "<source text>" [en="..."] [--file admin/backup]`,
    );
  }
  const set = picked(sets, values.set);
  const texts: Record<string, string> = { [set.project.source]: text };
  for (const pair of pairs) {
    const [, locale, other] = TEXT_PAIR.exec(pair) ?? [];
    if (locale === undefined || other === undefined)
      throw new Error(`"${pair}" is not <locale>=<text>`);
    texts[locale] = other;
  }
  const created = createMessage(set, key, texts, values.file?.replace(/\.json$/, ''));
  writeTypes(sets);
  const where = set.layout === 'flat' ? set.name : `${created.file}.json`;
  print(`${key} written to ${where} in ${created.locales.join(', ')}`);
  return 0;
}

const SKIPPED = new Set(['node_modules', 'dist', 'build', 'target', 'vendor', 'coverage']);
const NAMES_KEYS = /\.(?:tsx?|jsx?|rs)$|^module\.json$/;

/** Every source file under `root` a key can be named in: TypeScript, Rust and
 *  module manifests, outside installed and built trees. A declaration is not
 *  one: the generated key types spell every key. */
export function sourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (NAMES_KEYS.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(path);
    }
  };
  walk(root);
  return found;
}

export function renameCommand(context: Context, args: string[]): number {
  const { sets, print, root } = context;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { set: { type: 'string' }, 'keep-code': { type: 'boolean' } },
  });
  const [from, to] = positionals;
  if (from === undefined || to === undefined) {
    throw new Error(`usage: ${context.bin} rename <key> <new-key>`);
  }
  const locales = renameMessage(picked(sets, values.set), from, to);
  writeTypes(sets);
  print(`${from} is now ${to} in ${locales.join(', ')}`);
  if (values['keep-code']) return 0;
  const changed = rewriteLiterals(sourceFiles(root), from, to);
  print(`${changed.length} source files updated`);
  for (const file of changed) print(`  ${relative(root, file)}`);
  return 0;
}

export function removeCommand(context: Context, args: string[]): number {
  const { sets, print } = context;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { set: { type: 'string' } },
  });
  if (positionals.length === 0) throw new Error(`usage: ${context.bin} rm <key...>`);
  const set = picked(sets, values.set);
  for (const key of positionals) {
    print(`${key} removed from ${removeMessage(set, key).join(', ')}`);
  }
  writeTypes(sets);
  return 0;
}

export function unusedCommand(context: Context, args: string[]): number {
  const { sets, print, root } = context;
  const { values } = parseArgs({
    args,
    options: { json: { type: 'boolean' }, set: { type: 'string' } },
  });
  const source = readSource(picked(sets, values.set));
  const unused = unusedMessages(source, namedInFiles(sourceFiles(root)));
  if (values.json) print(JSON.stringify(unused, null, 2));
  else if (unused.length === 0) print('Every message is named somewhere.');
  else {
    print(`${unused.length} messages no source file names. Read before deleting:`);
    print('a key that arrives in data, or is built with +, shows here too.\n');
    for (const key of unused) print(`  ${key}`);
  }
  return 0;
}
