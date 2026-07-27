# @kroma/workbench

A component atelier, and the SDK for the stories it shows.

The replacement for Storybook, and the reason it fits in a package this size is
that it is not a separate application. Storybook ships a manager UI, an iframe
protocol, a builder abstraction and an addon API because it has to host any
framework's components inside its own tree. Here the tool and the components are
the same design system, rendered by the same renderer, in one tree. What is left
is a tree, a canvas and an inspector.

It **wears Storybook's layout**, which is a different claim from replacing it and
a deliberate one: that arrangement has been argued over for ten years and it wins
on the same grounds every time. The brand and the search sit at the top of the
explorer, the toolbar spans only the canvas it acts on, and the addons panel is
tabbed — so there is no full-width chrome, and nothing on screen is unattached to
the component being looked at.

The consequence worth the trouble: **it runs wherever the kit runs.** Open it in a
browser (`bun run dev:kit`), on a TV shell (`?workbench`), on an Apple TV
(`bun run run:kit:appletv`) or on a phone (`bun run run:kit:ios`), and you
are inspecting the components on the device that has to display them.

## Mounting it

`defineWorkbench` takes the facts and returns the component. A config file is then
declarative — no hooks, no memos, nothing with a lifecycle to get wrong, because all
of that happens inside. `clients/kit/src/config.tsx` is the real one, and it is about
thirty lines:

```tsx
export const Kit = defineWorkbench({
  stories: STORIES,                 // a PROP: see below
  title: 'Kit',                     // the wordmark
  brand: <Logo size={19} />,        // a SLOT: nothing drawn without it
  provider: {                       // app context + the lens that changes it
    name: 'Language',
    glyph: 'language',
    values: [{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }],
    render: (locale, set, children) => (
      <I18nProvider locale={locale} onLocaleChange={set}>{children}</I18nProvider>
    ),
  },
});
```

`<Kit />` is the whole site. Four seams make the package app-agnostic:

**`stories` is a prop, not an import.** Discovery needs a bundler primitive —
`import.meta.glob` on Vite, `require.context` on Metro — and both are compile-time
transforms resolved relative to *the file that writes them*, so the glob can only
live in the app that wants it (and this package, which knows no design system, has no
business naming one library's directory). It is **two lines**, and a glob pattern
resolves aliases, so no app counts `../` to the components:

```ts
export const STORIES = discoverVite(
  import.meta.glob('#ui/**/*.{stories,demo}.tsx', { eager: true }),
  import.meta.glob('#ui/components/**/*.tsx', { eager: true, query: '?raw', import: 'default' }),
);

// Metro: one context, both file names
export const STORIES = discoverMetro(
  require.context('../../ui/src', true, /\.(stories|demo)\.tsx$/),
);
```

One glob for the modules, one for the same tree as **text** — the second is optional,
and what it feeds (a demo's code panel, the Props tab) is simply absent without it.
Stories and demos are told apart by their own file names, inside `discover`, so a
host cannot hand over demos and demo sources that disagree.

`discoverVite` / `discoverMetro` do everything that happens to the result:
levelling by folder, ordering, attaching demos, reading each component's props out
of its own JSDoc. Nothing is listed and nothing is registered — drop a
`*.stories.tsx` beside a component and it appears.

> Both the pattern **and** the options must be written out as literals at every
> `import.meta.glob` call, and `import.meta` must not be put in a local first: the
> call is found by matching that exact text, so `vite.glob(...)` compiles, ships,
> and throws `glob is not a function`. An inline
> `(import.meta as unknown as GlobHost).glob(...)` survives type stripping and is
> how a Metro-compiled package writes one without `vite/client`.

**`brand` is a slot.** This package has no design system of its own to be the logo
of, so it draws whatever it is handed and nothing otherwise.

**`provider` is app context, and its lens for free.** The recurring shape is a
context every story needs in order to render at all — KROMA's i18n provider, whose
translated components call `useT()` and throw outside one — whose value is *also*
worth flipping while looking at a design. Declaring it gets both: the workbench
holds the state, wraps the tree, and puts a toolbar menu on it.

**`router` is an adapter.** See below.

## Routing

The workbench runs in four places that disagree about what a URL is: a site that
owns the address bar, a TV shell squatting on someone else's page behind
`?workbench`, an Apple TV with none at all, and a phone screen inside a router
that already owns the history. So routing is a **port** — one hook, shaped like
`useState` — and the host plugs in an adapter:

| | |
| --- | --- |
| `pathRouter()` | **the default. Real paths** — `/story/button/matrix` — on the History API alone, no router dependency. Degrades to memory off the web |
| `memoryRouter()` | never touches the address bar. For a guest mount, for native, for tests |
| `tanstackRouter()` | `@kroma/workbench/tanstack`. Real paths through the *host's* router rather than a second one, so there is only ever one in the tree |
| `searchParamsRouter()` | `?story=&view=`. Only for a shell that **cannot** do path routing — a TV app loaded off the filesystem, where there is no server to fall back to `index.html` and a reload of `/story/button` is a 404 |

A host with an idea of its own writes about fifteen lines and plugs that in.

### Real paths

There is no query string. Both the default adapter and the TanStack one put the
workbench on paths:

```
/story/button                 the live preview
/story/button/matrix          its variant matrix
/story/poster-card/scene-1    its second hand-written scene
/story/button/demo-0          its first worked example
```

A link you can read, type and shorten. `preview` is spelled by being **absent**, so
the commonest state has the shortest URL, and `pushState` is used for a new story
(it is a page; Back should return to the last one) while a tab within one gets
`replaceState`. A `popstate` listener makes the browser's own Back move the canvas.

`pathRouter({ base })` takes the path it is mounted at, so a site served from a
sub-directory works. It needs a server that falls back to `index.html` for unknown
paths — every dev server and static host worth using, but *not* a TV app loaded
off the filesystem.

`tanstackRouter()` instead participates in the host's route tree like any other
page. The host declares two routes, because TanStack has no optional params:

```tsx
createRoute({ path: '/story/$storyId',       component: WorkbenchPage })
createRoute({ path: '/story/$storyId/$view', component: WorkbenchPage })
```

...and because `useParams` subscribes, a `<Link>` elsewhere in the host's own UI
moves the canvas too.

`?shot` is the one thing left in the search, on every adapter: it is a screenshot
runner's **flag**, not a place you navigate to, and giving a flag a route would mean
the runner's URLs and a reader's URLs had different shapes.

A view is spelled twice, and both parse: `scene:1` in a search param, where a
colon is unremarkable, and `scene-1` in a path segment, where it reads as
something a person could have typed.

## Adding to it

**A story** is `<component>.stories.tsx` beside the component. Declare `name`,
`group`, `docs`, and `render`; pass the component's `sv` as `variants` and the
controls and the variant matrix are derived from it — the variant map IS the
design, so neither can drift. Nothing registers a story: the registries discover
`*.stories.tsx`.

**A demo** is ONE FILE, `<story>.<demo>.demo.tsx`, default-exporting a component.
Its file name becomes the tab, its doc comment the prose, and **the file itself**
the code sample (`demos.ts`). Demos used to carry a hand-written copy of their own
source and every one had already drifted; a sample cannot drift from the demo when
it IS the demo.

## What derives itself

Four things are read rather than declared, which is the theme of the folder:

| Shown | Read from |
| --- | --- |
| Controls + the variant matrix | the component's `sv` |
| The atomic level in the sidebar | the story file's PATH (`tierFor`) |
| A demo's name, prose and code | its file name, doc comment and text |
| Every prop, with its documentation | the component's props interface (`props.ts`) |

## Getting around

| | |
| --- | --- |
| `⌘K` / `Ctrl-K` | the command palette — the workbench's one search |
| `↑` `↓` `PgUp` `PgDn`, `↵`, `esc` | walk the results, open one, give up |
| the tree | fold a level or a group; the open story is always revealed |
| the toolbar | one menu per lens (frame, surface, language), a rotate button on the frames that turn, plus copy-link and full screen |

### Width

Most stories need nothing here: a button is as wide as its label and the canvas
measures it. A component that measures **itself** — a rail, a grid, a virtual list
— has to be told, and `width` takes three forms:

| | |
| --- | --- |
| `'fill'` | whatever the stage has, and it changes with the window. What a rail gets in a real app |
| `{ min, max }` | the same, clamped. `max` stops a 10-foot row stretching across a 4K desk; below `min` the stage scrolls rather than measuring the component at a width no screen has |
| `340` | a fixed authored width. Honest for something that really is one size — a dialog panel — and the wrong tool for anything responsive |

**Prefer a range.** The bug a fixed width hides is the one that only appears at
another width.

A story that says how wide it is is **never scaled**. `react-native-web` implements
`onLayout` with `getBoundingClientRect` — post-transform — so inside a `scale(0.8)`
a self-measuring component is told it has 80% of the width its children are laid
out against. `VirtualRail` derives its tile pitch, scroll offset and edge-scrim
positions from that number, and drew a row built for an 880pt viewport into an
1100pt one: tiles sliced at the ends, black scrims over the artwork. See
`stageWidth`.

The canvas captions itself — `Tablet · 834 × 1112 · portrait · 72%` — because the
frame's points and the zoom it is being shown at are both things you have to know
before judging a type size or a hit target. The frame wears a **casing**: the
stage can be set to the page's own colour, so an edge was the only thing saying
where the viewport started, and that edge lives inside the zoom transform (a 1pt
hairline at 40% is drawn 0.4px). Hence `hairline()`, which counter-scales it.

## The pieces

- `workbench.tsx` — the shell: selection, url state, full screen, the lenses.
- `layout.ts` — one pure function turning a window size into wide / medium / compact.
- `sidebar.tsx` — the brand, the search key and the foldable tree: atomic level,
  then group, then story.
- `command.tsx` — the ⌘K palette, built to cmdk's design and driven by a
  capture-phase key listener (react-native-web's TextInput eats bubbled keydowns).
- `toolbar.tsx` — the canvas toolbar: a menu per lens, so nine flat buttons became
  three triggers that each say what is currently in force.
- `canvas.tsx` — the stage: the frame table (`VIEWPORTS`, the one place a frame's
  name, glyph, size and rotatability live), the casing, the caption, and the
  adaptive zoom that scales a component down when it is wider than the canvas.
- `panel.tsx` — the inspector, tabbed: Controls, Docs, Props, each with its count.
- `story.ts` — the SDK: `story()`, the `sv`-derived controls and matrix, scenes,
  the atomic level read from a file's path, and the registry's ordering.
- `controls.tsx`, `code.tsx`, `docs.tsx`, `props.ts`, `demos.ts` — the parts above.

The story SDK ships here rather than separately because a story format that
versioned apart from the tool that reads it is two versions to keep in step.

The **registry** is the host's, in `packages/ui/src/workbench/` — Metro's and
Vite's halves of discovery. Vite can read files as text (`?raw`) and run a type
checker over the tree at build time; Metro can do neither. So demo code and prop
docs are present on the web and absent on a television, rather than stale on
both.

Prop docs are the third argument to `discoverVite`, and they are DATA: a host
reads them at build time (`propDocs` in `clients/tv-build`, driving TypeScript's
own checker) rather than shipping every component's source to the browser for a
regex to read. That is what lets the panel follow `extends`.

Nothing here is exported from `@kroma/ui/kit`: it is a tool, and it pulls in every
story. Each KROMA host configures its own — `clients/kit` (the site, and the
phone/TV app of the same name), `packages/tv/src/workbench{,.web}.tsx`
(`?workbench` on the TV shells), and `clients/mobile/src/app/workbench.tsx`.

The **story SDK** has its own subpath, `@kroma/workbench/story`, so a
`*.stories.tsx` declaring itself does not drag the whole tool into a bundle.
