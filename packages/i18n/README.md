# @kromatv/i18n

A small, fully typed message engine for TypeScript apps, with optional React
bindings and a Vite plugin. Catalogs are flat JSON files, one folder per
language. Nothing lists them: the folder is the configuration. Keys and their
variables are typed from the files, screens fetch only the catalog files they
name and only in the language being read, a language can be partly translated,
and nothing is generated into your repository.

## The catalog

A catalog is a flat map from key to template. A key's first segment is its
namespace. A language is a folder, and a namespace is a file in it, or a folder
of files once it has grown too long:

```
src/locales/
  i18n.json          { "source": "en", "locales": { "fr": { "stage": "stable" } } }
  en/
    lang.json        { "lang.en": "English", "lang.fr": "French" }
    nav.json         { "nav.home": "Home", "nav.search": "Search" }
    cart.json        { "cart.items": "{count} items", "cart.items_one": "{count} item" }
    admin/
      users.json     { "admin.invite": "Invite" }
      backup.json    { "admin.backupNow": "Back up now" }
  fr/
    lang.json        { "lang.fr": "Français" }
    nav.json
```

Templates interpolate `{name}`, quote another message with `$t(other.key)`
(expanded once at load), and pluralise through CLDR categories written as a
suffix: `key_one`, `key_other`, `key_zero` and so on, picked by the `count`
variable through `Intl.PluralRules`. `lang.<code>` is each language's own
name, which is also what the engine accepts as a locale beside a BCP 47 tag.

`i18n.json` is the policy. `source` names the language the messages are written
in: its files are the complete set, they type the keys, and every other language
falls back to it. `fallback` names what an unfinished translation reads in
first. Each locale has a `stage`: a `draft` (the default) is offered to nobody,
a `beta` is offered and reads in its fallback where it has no translation, and
a `stable` one is held complete by whatever check the project runs.

## Setup

Three pieces, each a few lines.

**The engine module.** It reads the folder with your bundler's glob and hands
the result to `defineI18n`:

```ts
// src/i18n.ts
/// <reference path="./locales/messages.d.ts" />
import { catalogsByLocale, defineI18n, sourcesByFile } from '@kromatv/i18n';
import project from './locales/i18n.json';

export const { i18n, translate, LOCALES, DEFAULT_LOCALE, detectLocale } = defineI18n({
  // Shipped up front: only the language names, which the locale set needs
  // before anything renders.
  catalogs: catalogsByLocale(
    import.meta.glob('./locales/*/lang.json', { eager: true, import: 'default' }),
  ),
  // Offered on demand: everything, one loader per file.
  lazy: sourcesByFile(import.meta.glob('./locales/*/**/*.json', { import: 'default' })),
  project,
});
```

**The Vite plugin.** It writes the declaration the reference above points at,
and it bundles each catalog file with the code that reads it (see below):

```ts
// vite.config.ts
import { catalogs } from '@kromatv/i18n/vite';

export default {
  plugins: [catalogs({ dir: 'src/locales' })],
};
```

Add `src/locales/messages.d.ts` to `.gitignore`. Run the dev server or a build
once, or call `writeCatalogTypes(dir)` from a script, before the first typecheck
on a fresh clone.

**The provider.** For React, wrap the tree once and translate anywhere:

```tsx
import { I18nProvider, useT } from '@kromatv/i18n/react';

<I18nProvider i18n={i18n} locale={locale} onLocaleChange={setLocale}>
  <App />
</I18nProvider>;

function Title() {
  const t = useT();
  return <h1>{t('nav.home')}</h1>;
}
```

## Typed keys and variables

The declaration lists every message of the source language with the variables
its templates name. `t('nav.home')` autocompletes, `t('cart.items')` does not
compile until it is given `{ count }`, and `count` has to be a number because a
plural variant selects on it. A plural variant is not a key of its own.

A key that is only known to be one of several, a variable or a template literal
type, accepts any variables. Outside React, `translate(locale, key, vars)` is
typed the same way.

## How a screen gets its messages

The plugin scans each source module for string literals that are keys in the
source language, `'cart.items'` or the head of a template like
`` `cart.${state}` ``, and appends an import of the catalog file they belong to.
That import is a tiny module handing the engine one loader per language for the
file. So a file sits in the chunk graph of the code that reads it: the checkout
route's chunk brings `cart`, the backup page brings `admin/backup`, and a file
nothing on a page names is never downloaded.

The provider warms the locale it renders. When a chunk evaluates, the engine
fetches that locale's file for each catalog the chunk announced, and only that
one: a French reader never downloads `en/cart.json`. `useT()` suspends, through
React's `use()`, until what is in flight for its locale has landed, so a
Suspense boundary shows and no key is painted. Switching locale warms the new
one the same way.

A language that has not translated a whole file is fetched together with its
fallback, which the plugin works out per file at build time, and the lookup
walks the chain: the language itself, the language a regional tag belongs to,
the project's fallback, the source.

A key built at runtime from data still works: its first miss fetches every file
of its namespace in that locale and the provider redraws. Under a test runner,
pass `eager: true` to the plugin so catalogs land synchronously and nothing
suspends.

## Beyond the browser

- **Metro (React Native).** There is no `import.meta.glob`, so the plain file is
  Metro's and reads the folder with `require.context`, shipping everything
  eagerly, which costs nothing because a native bundle is one file anyway. The
  `.web.ts` half beside it is Vite's. In this repo that pair is
  `packages/core/src/locales/catalogs.ts` and `catalogs.web.ts`. The types come
  from the same `messages.d.ts`, written by `writeCatalogTypes` in a script.
- **Runtime scopes.** `i18n.add(scope, catalogs)` layers a catalog that arrives
  at runtime, a plugin's own messages for instance, ahead of the base ones for
  translators asked with that scope: `useT(scope)`.
- **Another engine.** The catalog format is deliberately plain so a server in
  another language can read the same files. KROMA's Rust server embeds the
  folder with a build script and renders notifications from it.

## Rules the folder implies

- A file holds only keys of the namespace its path starts with.
- Every language keeps a key in the file the source language keeps it in.
- A language other than the source may lack any message; it never has one the
  source does not.
- A `$t()` reference quotes a key of its own file, since files arrive one at a
  time.

KROMA checks these, tracks which translations are missing or outdated, and
adds languages with `@kromatv/i18n-tools` (`bun run i18n`).

## Dev tools

`@kromatv/i18n-devtools` mounts a panel in dev that switches the locale for the
session, marks every string with the catalog that answered it, and names the
key and source line behind the one under the pointer. It reads the engine
through `installKeyInspector` and `installLocaleOverride`, exported here.
