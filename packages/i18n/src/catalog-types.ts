import { groupMessages, variablesOf } from './messages.ts';
import type { Catalog } from './types.ts';

export interface CatalogTypesSource {
  /** Every locale folder, whatever its stage. */
  readonly locales: readonly string[];
  /** The source language's messages, every namespace merged. */
  readonly source: Catalog;
}

const HEADER = `// Written by @kromatv/i18n/vite from the catalog files beside it, and ignored by
// git. The Vite dev server refreshes it; \`bun run i18n types\` does without one.
// Do not edit.`;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const alphabetical = (a: string, b: string) => a.localeCompare(b);

function property(name: string): string {
  return IDENTIFIER.test(name) ? name : `'${name}'`;
}

function shape(variables: ReadonlyMap<string, 'number' | 'value'>): string {
  if (variables.size === 0) {
    return '{}';
  }
  const fields = [...variables]
    .sort(([a], [b]) => alphabetical(a, b))
    .map(([name, kind]) => `${property(name)}: ${kind === 'number' ? 'number' : 'V'}`);
  return `{ ${fields.join('; ')} }`;
}

function messageLines(source: Catalog): string[] {
  return [...groupMessages(source).messages.values()]
    .sort((a, b) => alphabetical(a.key, b.key))
    .map((message) => `      '${message.key}': ${shape(variablesOf(message))};`);
}

/**
 * The declaration that teaches `@kromatv/i18n` a folder of catalogs: `Register`
 * gains the locales, and every message of the source language with the
 * variables it takes, so `t('cart.items')` without its `count` does not
 * compile. A plural variant is folded into its base key, the only one a caller
 * names. Pure, so a test can render it without a disk; the Vite plugin scans
 * and writes.
 */
export function renderCatalogTypes({ locales, source }: CatalogTypesSource): string {
  const union = [...locales]
    .sort(alphabetical)
    .map((locale) => `'${locale}'`)
    .join(' | ');

  return [
    HEADER,
    '',
    'type V = string | number;',
    '',
    "declare module '@kromatv/i18n' {",
    '  interface Register {',
    `    locale: ${union || 'never'};`,
    '    messages: {',
    ...messageLines(source),
    '    };',
    '  }',
    '}',
    '',
    'export {};',
    '',
  ].join('\n');
}

const MODULE_HEADER = `// Written by the kroma CLI from this module's locales, and ignored by git.
// \`kroma i18n types\` refreshes it, and so do \`kroma dev\` and \`kroma check\`.
// Do not edit.`;

/**
 * The declaration that types a module's own messages: it augments `target`,
 * the package the module imports `useT` from, so a key of the module's source
 * language is checked with its variables beside the app's.
 */
export function renderModuleTypes(source: Catalog, target: string): string {
  return [
    MODULE_HEADER,
    '',
    'type V = string | number;',
    '',
    `declare module '${target}' {`,
    '  interface ModuleRegister {',
    '    messages: {',
    ...messageLines(source),
    '    };',
    '  }',
    '}',
    '',
    'export {};',
    '',
  ].join('\n');
}
