# @kroma/i18n

A small, fully typed message engine for TypeScript apps, with optional React
bindings and a Vite plugin. Catalogs are flat JSON files, one per language and
one per namespace. Nothing lists them: the folder is the configuration. Keys are
typed from the files, screens fetch only the namespaces they name and only in
the language being read, and nothing is generated into your repository.

## The catalog

A catalog is a flat map from key to template. A key's first segment is its
namespace, and a namespace is one file per language:

```
src/locales/
  en/
    lang.json        { "lang.en": "English", "lang.fr": "Français" }
    nav.json         { "nav.home": "Home", "nav.search": "Search" }
    cart.json        { "cart.items": "{count} items", "cart.items_one": "{count} item" }
  fr/
    lang.json
    nav.json
    cart.json
```

Templates interpolate `{name}`, quote another message with `$t(other.key)`
(expanded once at load), and pluralise through CLDR categories written as a
suffix: `key_one`, `key_other`, `key_zero` and so on, picked by the `count`
variable through `Intl.PluralRules`. `lang.<code>` is each language's own
name, which is also what the engine accepts as a locale beside a BCP 47 tag.

One language is the default. Its files are the complete set, they type the
keys, and every other language falls back to them.

## Setup

Three pieces, each a few lines.

**The engine module.** It reads the folder with your bundler's glob and hands
the result to `defineI18n`:

```ts
// src/i18n.ts
/// <reference path="./locales/messages.d.ts" />
import { catalogsByLocale, defineI18n, sourcesByNamespace } from '@kroma/i18n';

export const { i18n, translate, LOCALES, DEFAULT_LOCALE, detectLocale } = defineI18n({
  // Shipped up front: only the language names, which the locale set needs
  // before anything renders.
  catalogs: catalogsByLocale(
    import.meta.glob('./locales/*/lang.json', { eager: true, import: 'default' }),
  ),
  // Offered on demand: everything, one loader per file.
  lazy: sourcesByNamespace(import.meta.glob('./locales/*/*.json', { import: 'default' })),
  defaultLocale: 'en',
});
```

**The Vite plugin.** It writes the declaration the reference above points at,
and it bundles each namespace with the code that reads it (see below):

```ts
// vite.config.ts
import { catalogs } from '@kroma/i18n/vite';

export default {
  plugins: [catalogs({ dir: 'src/locales', defaultLocale: 'en' })],
};
```

Add `src/locales/messages.d.ts` to `.gitignore`. Run the dev server or a build
once, or call `writeCatalogTypes(dir, defaultLocale)` from a script, before the
first typecheck on a fresh clone.

**The provider.** For React, wrap the tree once and translate anywhere:

```tsx
import { I18nProvider, useT } from '@kroma/i18n/react';

<I18nProvider i18n={i18n} locale={locale} onLocaleChange={setLocale}>
  <App />
</I18nProvider>;

function Title() {
  const t = useT();
  return <h1>{t('nav.home')}</h1>;
}
```

`t('nav.home')` autocompletes and typechecks against every file in the folder.
`t('cart.items', { count: 3 })` picks the plural form. Outside React,
`translate(locale, key, vars)` does the same.

## How a screen gets its messages

The plugin scans each source module for string literals that are keys in the
default language, `'cart.items'` or the head of a template like
`` `cart.${state}` ``, and appends an import of the namespace they belong to.
That import is a tiny module handing the engine one loader per language for the
namespace. So a namespace sits in the chunk graph of the code that reads it: the
checkout route's chunk brings `cart`, the settings chunk brings `settings`, and
a namespace nothing on a page names is never downloaded.

The provider warms the locale it renders. When a chunk evaluates, the engine
fetches that locale's file for each namespace the chunk announced, and only that
one: a French reader never downloads `en/cart.json`. `useT()` suspends, through
React's `use()`, until what is in flight for its locale has landed, so a
Suspense boundary shows and no key is painted. Switching locale warms the new
one the same way.

A key built at runtime from data still works: its first miss fetches the
namespace in that locale and the provider redraws. Under a test runner, pass
`eager: true` to the plugin so catalogs land synchronously and nothing suspends.

## Beyond the browser

- **Metro (React Native).** There is no `import.meta.glob`, so the engine
  module has a `.native.ts` half that reads the folder with
  `require.context` and ships everything eagerly; a native bundle is one file
  anyway. The types come from the same `messages.d.ts`, written by
  `writeCatalogTypes` in a script.
- **Runtime scopes.** `i18n.add(scope, catalogs)` layers a catalog that arrives
  at runtime, a plugin's own messages for instance, ahead of the base ones for
  translators asked with that scope: `useT(scope)`.
- **Another engine.** The catalog format is deliberately plain so a server in
  another language can read the same files. KROMA's Rust server embeds the
  folder with a build script and renders notifications from it.

## Rules the folder implies

- A file holds only keys of the namespace it is named after.
- Every language has every namespace, with the same keys.
- A `$t()` reference quotes a key of its own namespace, since namespaces arrive
  one at a time.

Each is a few lines of test over the glob; KROMA's live in
`packages/core/src/locales/catalogs.test.ts`.

## Dev tools

`@kroma/i18n-devtools` mounts a panel in dev that switches the locale for the
session, marks every string with the catalog that answered it, and names the
key and source line behind the one under the pointer. It reads the engine
through `installKeyInspector` and `installLocaleOverride`, exported here.
