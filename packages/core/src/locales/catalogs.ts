import { type Catalog, catalogsByLocale } from '@kroma/i18n';

// The Metro half; `catalogs.web.ts` beside it is Vite's. A native bundle is one
// file, so every namespace is read here at boot: `require.context` is Metro's
// glob, expanded at build time from the literal call below.
interface MetroContext {
  keys(): string[];
  (key: string): Catalog;
}

declare const require: {
  context(directory: string, recursive: boolean, filter: RegExp): MetroContext;
};

function every(): Record<string, Catalog> {
  let context: MetroContext;
  try {
    context = require.context('.', true, /\.json$/);
  } catch {
    return {};
  }
  const files: Record<string, Catalog> = {};
  for (const key of context.keys()) files[key] = context(key);
  return files;
}

export const catalogs = catalogsByLocale(every());

export const lazy = {};
