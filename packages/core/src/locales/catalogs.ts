import { type Catalog, LABEL_NAMESPACE, parseCatalogPath } from '@kromatv/i18n';

// The Metro half; `catalogs.web.ts` beside it is Vite's. A native bundle is one
// file, so every language is in it, but a reader uses one or two: the language
// names are read at boot, since the locale set needs them before anything
// renders, and the rest of a language only when it is first rendered.
// `require.context` is Metro's glob, expanded at build time from the literal
// call below, and a module it names is evaluated when it is asked for.
interface MetroContext {
  keys(): string[];
  (key: string): Catalog;
}

declare const require: {
  context(directory: string, recursive: boolean, filter: RegExp): MetroContext;
};

interface Bundled {
  catalogs: Record<string, Catalog>;
  deferred: Record<string, () => Catalog>;
}

function bundled(): Bundled {
  let context: MetroContext;
  try {
    context = require.context('.', true, /\.json$/);
  } catch {
    return { catalogs: {}, deferred: {} };
  }
  const shipped: Record<string, Catalog> = {};
  const later: Record<string, string[]> = {};
  for (const key of context.keys()) {
    const at = parseCatalogPath(key);
    if (!at) {
      continue;
    }
    if (at.file === LABEL_NAMESPACE) {
      shipped[at.locale] = context(key);
      continue;
    }
    const files = later[at.locale] ?? [];
    files.push(key);
    later[at.locale] = files;
  }
  const deferred: Record<string, () => Catalog> = {};
  for (const [locale, files] of Object.entries(later)) {
    deferred[locale] = () => Object.assign({}, ...files.map((file) => context(file)));
  }
  return { catalogs: shipped, deferred };
}

export const { catalogs, deferred } = bundled();

export const names: Readonly<Record<string, string>> | undefined = undefined;

export const lazy = {};
