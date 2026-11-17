# @kromatv/i18n-devtools

The panel a developer inspects the app's translations with: switch the locale
for the tab, mark every string on the page with what answered it, and read the
key, the variables and the file behind the one under the pointer.

Dev server only, and a shell configures nothing:

```ts
import { kromaI18nDevtools } from '@kromatv/i18n-devtools/vite';

export default defineConfig({ plugins: [kromaI18nDevtools()] });
```

The plugin reads which engine the app translates through off what it depends
on, injects `mount()` into that engine's own front door, and carries the
react-native-web pipeline the panel needs - the panel is `@kromatv/ui`, and a
site that renders no kit component has no reason to carry that itself. It
applies on `serve` alone, so a built shell never sees any of it.

## The engine is an adapter

The panel names no engine. It is handed an `Engine` at mount, and everything it
needs from one is four methods and three optional members: the two switches,
the locales to offer, the locale the app resolved, how that engine names a
plural category where it disagrees with CLDR, a subscription for an engine whose
locales are not settled before the tools mount, and whether the dev server can
write its catalogs. An adapter ships as a subpath and
takes its engine as an **optional peer**, so a shell that uses neither pulls in
neither. Three ship: `@kromatv/i18n-devtools/{kroma,i18next,paraglide}`.

The plugin picks one on its own. Name it only in an app that depends on two:

```ts
kromaI18nDevtools({ adapter: 'paraglide' });
```

An engine the tools cannot reach is a reason to stay out of the way rather than
to break the app: with no adapter for what the app speaks, nothing is injected.

What is engine-specific lives in the adapter, including the placeholders a
message was given no value for: `{name}` in one engine is `{{name}}` in the
next, and an engine that drops an unfilled placeholder leaves nothing in the
rendered text to find them by. The adapter fills `Rendered.holes`.

## Working on the catalogs from the page

An adapter that declares `writable` says the dev server reads and writes its
catalogs on disk. Only the KROMA adapter does, and the plugin serves these asks
to a KROMA app alone. Everything below is absent for any other engine.

- **Edit a message.** Point at a string and press `Ctrl+Alt+E`. The editor
  shows the key, the source language's text, and one field per form the
  rendered locale writes (a plural has several). Save writes the catalog file
  through `@kromatv/i18n-tools` and updates the locks. The page shows the saved
  text in place, in every open tab, with no reload: the catalogs plugin sends
  the saved file to the page and the engine repaints the messages that changed,
  so the language and the highlight stay as they were. Editing the source language
  works the same way, and marks its translations outdated. A module's message
  is written the same way, but the page shows it only once that module is
  rebuilt, which the editor says.
- **Status.** The panel shows how the rendered locale stands across what the
  app renders, its own catalogs and its modules': the share translated, and how
  many messages are missing, outdated or unreviewed. It is read again each time
  a catalog file is saved, whoever saved it.
- **Two more grades.** A string its own catalog answered is marked `outdated`
  when the source text changed since it was translated, and `unreviewed` when a
  machine wrote it and nobody has read it. A string that is both is `outdated`.
  `missing`, `vars` and `fallback` keep precedence: they are about what is on
  screen now.
- **Confirm a translation.** On an `outdated` or `unreviewed` string, press
  `Ctrl+Alt+C` to record that it holds as it reads.
- **Open a message in Lingua.** Point at a string and press `Ctrl+Alt+L`, or
  follow the editor's link, to open its page on the repository's translation
  site in a new tab, in the rendered locale. The dev server reads the site off a
  `lingua.json` at or above its root, no higher than the top of the checkout
  (`url`, https only), and the project off the `upstream` remote, or `origin`
  where there is none: a fork's `origin` is the fork, which Lingua does not
  list. Without either there is no link and no chord. Only the app's own
  messages get one: Lingua does not keep a module's.

The server refuses what it cannot vouch for: a key that is no message of the
set, a locale the set keeps no catalog for, a placeholder the source message
never names, a `$t(key)` that quotes a key that is no message or one kept in
another catalog file, a request past the size bound. A probe with no scope is
the app's set, and a module's scope is that module's set. The website's
messages are another app's and are neither counted nor written from here.

One known limit: a key deleted from a catalog lingers on the page until the
next load, since the engine merges what it is sent.

The mark on the page still says only what the engine knew when it drew the
string. The two grades the lock gives are looked up by key when the overlay
reads a mark, in `overlay/review.ts`, because they arrive after the render and
change without one.

## Where things live

| Folder | What it holds |
| --- | --- |
| `engine/` | The seam: the `Engine` an adapter implements, and the two things every engine renders the same way - the `[core/key]` label and the CLDR plural fallback. One folder per engine beside them, each holding its adapter and that adapter's tests. |
| `overlay/` | What marks the page: the zero-width mark a message carries, the browser highlights drawn from it, and the probe that names what is under the pointer. |
| `panel/` | The floating window: its controls, the log of what went wrong, the grip it drags by and the chords it answers. |
| `server/` | What the dev server is asked, over the channel Vite already keeps open: which editors this machine has, where a served line was written, open this file, and for a `writable` engine read, write and confirm a message and say how a locale stands. |

`mount.tsx` puts it on the page, `session.ts` is what the tab remembers, and
`testing.ts` is the smallest engine a test can inspect.
