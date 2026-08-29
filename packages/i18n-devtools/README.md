# @kroma/i18n-devtools

The panel a developer inspects the app's translations with: switch the locale
for the tab, mark every string on the page with what answered it, and read the
key, the variables and the file behind the one under the pointer.

Dev server only, and a shell configures nothing:

```ts
import { kromaI18nDevtools } from '@kroma/i18n-devtools/vite';

export default defineConfig({ plugins: [kromaI18nDevtools()] });
```

The plugin reads which engine the app translates through off what it depends
on, injects `mount()` into that engine's own front door, and carries the
react-native-web pipeline the panel needs - the panel is `@kroma/ui`, and a
site that renders no kit component has no reason to carry that itself. It
applies on `serve` alone, so a built shell never sees any of it.

## The engine is an adapter

The panel names no engine. It is handed an `Engine` at mount, and everything it
needs from one is four methods and an optional fifth — the two switches, the
locales to offer, the locale the app resolved, and how that engine names a
plural category where it disagrees with CLDR. An adapter ships as a subpath and
takes its engine as an **optional peer**, so a shell that uses neither pulls in
neither. Three ship: `@kroma/i18n-devtools/{kroma,i18next,paraglide}`.

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

## Where things live

| Folder | What it holds |
| --- | --- |
| `engine/` | The seam: the `Engine` an adapter implements, and the two things every engine renders the same way - the `[core/key]` label and the CLDR plural fallback. One folder per engine beside them, each holding its adapter and that adapter's tests. |
| `overlay/` | What marks the page: the zero-width mark a message carries, the browser highlights drawn from it, and the probe that names what is under the pointer. |
| `panel/` | The floating window: its controls, the log of what went wrong, the grip it drags by and the chords it answers. |
| `server/` | What the dev server is asked, over the channel Vite already keeps open: which editors this machine has, where a served line was written, and open this file. |

`mount.tsx` puts it on the page, `session.ts` is what the tab remembers, and
`testing.ts` is the smallest engine a test can inspect.
