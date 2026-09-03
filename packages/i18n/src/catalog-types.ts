import type { CatalogPath } from './layout';

export interface CatalogTypesSource {
  readonly files: readonly CatalogPath[];
  /** The locale whose files type the keys: the complete one. */
  readonly defaultLocale: string;
}

const HEADER = `// Written by @kroma/i18n/vite from the catalog files beside it, and ignored by
// git. The Vite dev server refreshes it; \`bun run gen:types\` does without one.
// Do not edit.`;

function pascal(word: string): string {
  return word
    .split(/[^A-Za-z0-9]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function binding(namespace: string): string {
  const upper = pascal(namespace);
  return `${upper.charAt(0).toLowerCase()}${upper.slice(1)}Messages`;
}

/**
 * The declaration that teaches `@kroma/i18n` a folder of catalogs: `Register`
 * gains the locales and every namespace's messages folded into one map, so
 * `MessageKey` covers the whole folder without a line of hand-written code.
 * Pure, so a test can render it without a disk; the Vite plugin scans and
 * writes.
 */
const alphabetical = (a: string, b: string) => a.localeCompare(b);

export function renderCatalogTypes({ files, defaultLocale }: CatalogTypesSource): string {
  const locales = [...new Set(files.map((file) => file.locale))].sort(alphabetical);
  if (!locales.includes(defaultLocale)) {
    throw new Error(`no catalog folder for the default locale "${defaultLocale}"`);
  }
  const namespaces = files
    .filter((file) => file.locale === defaultLocale)
    .map((file) => file.namespace)
    .sort(alphabetical);
  const union = locales.map((locale) => `'${locale}'`).join(' | ');

  return [
    HEADER,
    '',
    ...namespaces.map(
      (namespace) =>
        `import type ${binding(namespace)} from './${defaultLocale}/${namespace}.json';`,
    ),
    '',
    "declare module '@kroma/i18n' {",
    '  interface Register {',
    `    locale: ${union};`,
    '    messages:',
    ...namespaces.map(
      (namespace, at) =>
        `      typeof ${binding(namespace)}${at === namespaces.length - 1 ? ';' : ' &'}`,
    ),
    '  }',
    '}',
    '',
  ].join('\n');
}
