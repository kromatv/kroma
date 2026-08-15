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
tabbed, so there is no full-width chrome, and nothing on screen is unattached to
the component being looked at.

The consequence worth the trouble: **it runs wherever the kit runs.** Open it in a
browser (`bun run dev:kit`), on a TV shell (`?workbench`), on an Apple TV
(`bun run kit:tv`) or on a phone (`bun run kit:ios`), and you are inspecting the
components on the device that has to display them.

## Mounting it

`defineWorkbench` takes the facts and returns the component. A config file is then
declarative. No hooks, no memos, nothing with a lifecycle to get wrong, because all
of that happens inside:

```tsx
export const Kit = defineWorkbench({
  stories: STORIES,                 // a PROP: see below
  pages: PAGES,                     // standalone articles, discovered the same way
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

`<Kit />` is the whole site. In KROMA the standing half of that (`title`, `brand`,
`provider`) is a plain object in `@kroma/ui/workbench-config` that every host
spreads, so `apps/kit/src/config.tsx` is down to the discovery, the router and a
footer. Four seams make the package app-agnostic:

**`stories` is a prop, not an import.** Discovery needs a bundler primitive
(`import.meta.glob` on Vite, `require.context` on Metro), and both are compile-time
transforms resolved relative to *the file that writes them*, so the glob can only
live in the app that wants it (and this package, which knows no design system, has no
business naming one library's directory). It is **two lines**, and a glob pattern
resolves aliases, so no app counts `../` to the components:

```ts
export const STORIES = indexVite({
  modules: import.meta.glob('#ui/**/*.{story.mdx,demo.tsx}'),
  sources: import.meta.glob<string>('#ui/**/*.demo.tsx', { query: '?raw', import: 'default' }),
  codes: STORY_CODE, // virtual:kroma-story-code
  props: () => import('virtual:kroma-props').then((module) => module.PROPS),
});

// Metro: one context, both file names
export const STORIES = storyEntries(
  discoverMetro(
    require.context('../../../packages/ui/src', true, /\.demo\.tsx$|\.story\.mdx$/),
  ),
);
```

One glob for the modules, one for the same tree as **text**. The second is optional,
and what it feeds (a demo's code panel, the Props tab) is simply absent without it.
Stories and demos are told apart by their own file names, inside `discover`, so a
host cannot hand over demos and demo sources that disagree.

**`indexVite` lists the library without running it.** No `eager` on those globs:
each one yields a loader per file, and a story's module is fetched when a reader
opens it. What the tree, the palette and the source link need first - an id, a
name, a section, a level, a file - is an *index*, and it comes from
`virtual:kroma-story-code`, which the build already reads out of every story
file. The level is read from the path, but the name and the group are not: one
folder of molecules holds stories filed under Layout, Feedback, Input and
Actions alike, so they are read at build time rather than guessed. A build that
read nothing falls back to the file name, which keeps every deep link working
and only mis-files the sections. Until a story's module lands the canvas keeps
the toolbar and the heading and says it is busy; `Workbench` takes either shape,
so `discoverVite` (below) remains the spelling for a host with nothing to gain
from splitting - the TV shells, whose bundle is a file on the television.

A story is in the **module** glob, not the text one: both bundlers compile a
`.story.mdx` to a module (`@kroma/bundler/mdx` on Vite,
`@kroma/bundler/mdx-transformer` on Metro), so a host has to load the MDX plugin
(see *The document* below).

`discoverVite` / `discoverMetro` do everything that happens to the result:
levelling by folder, ordering, attaching demos and docs, reading each component's
props out of its own JSDoc. Nothing is listed and nothing is registered: drop a
`*.story.mdx` beside a component and it appears.

> Both the pattern **and** the options must be written out as literals at every
> `import.meta.glob` call, and `import.meta` must not be put in a local first: the
> call is found by matching that exact text, so `vite.glob(...)` compiles, ships,
> and throws `glob is not a function`. An inline
> `(import.meta as unknown as GlobHost).glob(...)` survives type stripping and is
> how a Metro-compiled package writes one without `vite/client`.

**`brand` is a slot.** This package has no design system of its own to be the logo
of, so it draws whatever it is handed and nothing otherwise.

**`provider` is app context, and its lens for free.** The recurring shape is a
context every story needs in order to render at all (KROMA's i18n provider, whose
translated components call `useT()` and throw outside one), whose value is *also*
worth flipping while looking at a design. Declaring it gets both: the workbench
holds the state, wraps the tree, and puts a toolbar menu on it.

**`router` is an adapter.** See below.

## Routing

The workbench runs in four places that disagree about what a URL is: a site that
owns the address bar, a TV shell squatting on someone else's page behind
`?workbench`, an Apple TV with none at all, and a phone screen inside a router
that already owns the history. So routing is a **port** (one hook, shaped like
`useState`), and the host plugs in an adapter:

| | |
| --- | --- |
| `pathRouter()` | **the default. Real paths** (`/story/button/matrix`) on the History API alone, no router dependency. Degrades to memory off the web |
| `memoryRouter()` | never touches the address bar. For a guest mount, for native, for tests |
| `tanstackRouter()` | `@kroma/workbench/tanstack`. Real paths through the *host's* router rather than a second one, so there is only ever one in the tree |
| `searchParamsRouter()` | `?story=&view=`. Only for a shell that **cannot** do path routing: a TV app loaded off the filesystem, where there is no server to fall back to `index.html` and a reload of `/story/button` is a 404 |

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
paths: every dev server and static host worth using, but *not* a TV app loaded
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

**A story** is `<component>.story.mdx` beside the component: a document, with one
typed export at the top of it. Declare `group` and either the `component` or a
`render`; pass the component's `sv` as `variants` and the controls and the
variant matrix are derived from it. The variant map IS the design, so neither can
drift. Nothing registers a story: the registries discover `*.story.mdx`.

```mdx
import { defineStory } from '@kroma/workbench/story';
import { Chip } from './chip';

export const story = defineStory({ group: 'Actions', component: Chip, args: { label: 'HDR' } });

A small, non-pressable statement of fact.
```

The name comes from the file (`chip.story.mdx` → `Chip`); `name` is written only
where that derivation is wrong. Naming the `component` is the shorter spelling
and the safer one: the workbench renders `<Chip {...args} />` itself, so the args
ARE the props and a control that moves nothing cannot be written. `args` is
checked against the component's props. Write a `render` instead when the story
has to compose (a provider, a surface to sit on, two of the component side by
side), and **take the args as its argument**.

`defineStory` exists for the types: MDX is not typechecked by `tsc`, so the one
place the story declares itself is a function call whose argument is, and every
story is rendered under jsdom by `apps/kit/src/stories.smoke.test.tsx` — the
guardrail that replaces the compiler for the JSX in the prose.

### A scene, and which of them the controls drive

A scene is a second take on the same component, written as `<Scene>` in the
prose where its explanation is. It appears twice for free: a live specimen in
the document, and a tab on the canvas with its own JSX in the drawer under it.
The **take** is its child:

| | |
| --- | --- |
| `{story.take((args) => …)}` | reads the live args. The controls keep driving it |
| a plain `<Element />` | a fixed composition. The controls step aside |
| no child at all | the story's own render, with the scene's `args` merged in |

`story.take` is identity at runtime and exists so an editor types the arrow with
the story's own args; the compiler lifts the arrow straight back out. Writing the
take as a `render`/`example` PROP is an error rather than a second spelling.

The panel follows the view on screen rather than the story: the Controls tab is
there when the thing being shown reads the args, and gone when it does not. A
knob that moves nothing reads as a broken workbench, so the format makes the
difference declarable and the compiler records it (`live`) before the args are
wrapped and every render looks alike.

Helpers - a stateful wrapper, a fixture list, a local `<Labelled>` - go in
`<component>.fixtures.tsx` beside the document and are imported by it. MDX is for
the writing; TypeScript stays in TypeScript.

**A demo** is ONE FILE, `<story>.<demo>.demo.tsx`, default-exporting a component.
Its file name becomes the tab, its doc comment the prose, and **the file itself**
the code sample (`demos.ts`). Demos used to carry a hand-written copy of their own
source and every one had already drifted; a sample cannot drift from the demo when
it IS the demo.

### The document

The prose IS the story file, which is why it is MDX: everything markdown and GFM
have (tables, `~~strike~~`, task lists, fenced samples), plus **live components**
in the middle of a sentence, plus the `<Scene>`, `<Do>` and `<Dont>` blocks the
workbench hands every document.

```mdx
import { ListRow } from './list-row';

One **D-pad stop** per row, and a pointer-sized hit area.

<ListRow.Root>
  <ListRow.Label>Qualité</ListRow.Label>
  <ListRow.Hint>1080p</ListRow.Hint>
</ListRow.Root>

<Do>
- Give the whole row one press target.
</Do>
```

`<Do>` and `<Dont>` wrap ordinary markdown - a list, a fenced sample, the
component itself - and render as a matched pair of cards, side by side wherever
the column fits two. Written as two blocks because that is how they read in a
source file; **paired at compile time**, so no document wraps its own. The card's
header carries the verdict, which is why a line inside says "Set a `pattern` the
keyboard contradicts" rather than "Don't set…": under a panel headed *Don't*, the
second says it twice. The canonical call site worth copying is an ordinary fenced
block, highlighted like any other sample. None of these needs an import: they
arrive in the element map (`STORY_COMPONENTS`).

The document reads on the CANVAS, in a Docs view at the reading measure with the
outline rail beside it - not in the inspector, whose column is a caption's width.

**It runs on native too.** MDX compiles to HTML element names (`p`, `ul`,
`code`, the table set) and React Native has none of them, so `mdx.tsx` maps
every one to a kit component and `mdx.test.tsx` derives the list of elements
from a real compile and fails if the map has a hole.

A host has to compile `.mdx`: `kromaMdx()` from `@kroma/bundler/mdx` in a Vite
config (before `react()`), and `expoWorkspaceConfig` already wires Metro's half.

## What derives itself

Four things are read rather than declared, which is the theme of the folder:

| Shown | Read from |
| --- | --- |
| Controls + the variant matrix | the component's `sv` |
| The atomic level (search + palette) | the story file's PATH (`tierFor`) |
| A demo's name, prose and code | its file name, doc comment and text |
| Every prop, with its documentation | the component's props interface, and a compound one's parts off its namespace object (`props.ts`) |
| The code under a scene, and under the preview | the document's own JSX, lifted at compile time by the remark plugin in `@kroma/bundler/mdx` |
| A story's name and group, before its module is fetched | its declaration, read at build time (`storyCode`, served as `virtual:kroma-story-code`) |

### The code drawer

Every view shows the code its author **wrote**: a demo's whole file, a scene's
JSX, the story's own `render`. Nothing is reconstructed - a compiled render's
`toString()` gives the post-transform `jsx(...)` calls, which is not what anybody
types - so the spans are cut out of the document at COMPILE time, by the same
remark plugin that lifts the scenes, and travel inside the compiled module.

That last part is why a scene's source reaches a television: the plugin runs in
the shared MDX options, so Metro compiles it too. The reader Vite runs
(`story-code-read.ts`) is left with one job, the index - a story's `name` and
`group`, which a sidebar needs before any module is fetched.

A plain-element take is shown as its JSX, because the arrow the compiler wraps it
in binds nothing a reader needs. An `(args) => …` take is kept whole: the
parameter is where the controls reach the JSX, and the body shown without it
reads as code with free variables in it. A scene that writes no take carries the
story's own render, which is what draws it.

The **live preview** of a story with variants keeps its generated call site,
because that is the one code here that follows the controls: press `glass` and
the line says `variant="glass"`. The story's own render fills in the previews
that showed nothing at all. The canonical call worth copying is a fenced block in
the prose, where it is read rather than generated.

## Getting around

| | |
| --- | --- |
| `⌘K` / `Ctrl-K` | the command palette, the workbench's one search |
| `↑` `↓` `PgUp` `PgDn`, `↵`, `esc` | walk the results, open one, give up |
| the tree | fold a group; the open story is always revealed |
| the toolbar | one menu per lens (frame, surface, language), a rotate button on the frames that turn, plus copy-link and full screen |

### Width

Most stories need nothing here: a button is as wide as its label and the canvas
measures it. A component that measures **itself** (a rail, a grid, a virtual
list) has to be told, and `width` takes three forms:

| | |
| --- | --- |
| `'fill'` | whatever the stage has, and it changes with the window. What a rail gets in a real app |
| `{ min, max }` | the same, clamped. `max` stops a 10-foot row stretching across a 4K desk; below `min` the stage scrolls rather than measuring the component at a width no screen has |
| `340` | a fixed authored width. Honest for something that really is one size (a dialog panel) and the wrong tool for anything responsive |

**Prefer a range.** The bug a fixed width hides is the one that only appears at
another width.

A story that says how wide it is is **never scaled**. `react-native-web` implements
`onLayout` with `getBoundingClientRect` (post-transform), so inside a `scale(0.8)`
a self-measuring component is told it has 80% of the width its children are laid
out against. `VirtualRail` derives its tile pitch, scroll offset and edge-scrim
positions from that number, and drew a row built for an 880pt viewport into an
1100pt one: tiles sliced at the ends, black scrims over the artwork. See
`stageWidth`.

The canvas captions itself (`Tablet · 834 × 1112 · portrait · 72%`) because the
frame's points and the zoom it is being shown at are both things you have to know
before judging a type size or a hit target. The frame wears a **casing**: the
stage can be set to the page's own colour, so an edge was the only thing saying
where the viewport started, and that edge lives inside the zoom transform (a 1pt
hairline at 40% is drawn 0.4px). Hence `hairline()`, which counter-scales it.

## The pieces

- `workbench.tsx` is the shell: selection, url state, full screen, and where the
  three regions go.
- `story-view.tsx` is one story on the canvas, and the four things a `View` is
  read for: what renders, its prose, its code sample and its play. `canvas-tabs.tsx`
  is the row across the top of it.
- `layout.ts` is one pure function turning a window size into wide / medium /
  compact. It says the size each region OPENS at; what a reader has dragged is
  `<Resizable>`'s, which owns the floors and the wish surviving a smaller screen.
  The seams themselves are the kit's now (`@kroma/ui`), not this package's.
- `page.ts` and `page-view.tsx` are articles: a whole `.page.mdx` shown as its
  own page, for what belongs to no component (installing the kit, making a theme,
  how it works). The file's name and folder say what it is and where it sits,
  and the document overrides that with plain `export const`, which is ESM, so
  it survives both bundlers with no frontmatter plugin.
- `sidebar.tsx` is the brand, the search key and the foldable tree: one flat
  level of functional groups (Layout, Input, Overlays, ...), then the stories.
  The atomic levels stay out of the nav on purpose: they are for the people
  editing the kit, and nesting them scattered every kind of input across
  three branches. The rows themselves are `sidebar-rows.tsx`.
- `command.tsx` is the ⌘K palette, built to cmdk's design and driven by a
  capture-phase key listener (react-native-web's TextInput eats bubbled keydowns).
- `toolbar.tsx` is the canvas toolbar: a menu per lens, so nine flat buttons
  became three triggers that each say what is currently in force. One lens is
  drawn by `toolbar-menu.tsx`.
- `viewport.ts` is the frame table (`VIEWPORTS`, the one place a frame's name,
  glyph, size and rotatability live) and the arithmetic under the stage:
  `stageWidth`, the rotation, and `hairline`.
- `canvas.tsx` is the stage itself: the casing, the caption, and the adaptive
  zoom that scales a component down when it is wider than the canvas.
- `panel.tsx` is the inspector, tabbed: Controls, Docs, Props, each with its count.
- `story.ts` is the SDK: `story()`, the two spellings of a story and of a scene,
  and `controlsRole`, which decides whether the panel drives the view on screen.
- `story-code.ts` is the build-time source a scene shows: the join from the path
  a bundler globbed to the one the repository spells, and the attach.
- `derive.ts` is the control model: the `sv`-derived controls and matrix rows.
- `view.ts` is which view of a story is on the canvas, and how one is spelled in
  an address. Apart from `router.ts` because the SDK reads a view too, and
  nothing here imports the design system.
- `registry.ts` is the atomic level read from a file's path, and the registry's
  ordering (functional group first, then name).
- `play-types.ts` is what a `play` is handed, addressed by accessible name so the
  same script runs on a television and in a browser.
- `controls.tsx`, `code.tsx`, `docs.tsx`, `props.ts`, `prop-table.tsx` and
  `demos.ts` are the parts above.

The story SDK ships here rather than separately because a story format that
versioned apart from the tool that reads it is two versions to keep in step.

The **globs** are the host's: `apps/kit/src/stories.web.ts` and `stories.ts`
beside it are Vite's and Metro's halves of discovery. Vite can read files as text
(`?raw`) and run TypeScript over the tree at build time; Metro can do neither. So
demo code, story code and prop docs are present on the web and absent on a
television, rather than stale on both.

Prop docs are `props`: a thunk on the lazy index, fetched with the first story,
and the third argument to `discoverVite`. They are DATA either way: a host reads
them at build time (`propDocs` from
`@kroma/bundler/props-docs`, driving TypeScript's own checker, served as
`virtual:kroma-props`) rather than shipping
every component's source to the browser for a regex to read. That is what lets
the panel follow `extends`.

Nothing here is exported from `@kroma/ui/kit`: it is a tool, and it pulls in every
story. Each KROMA host configures its own: `apps/kit` (the site, and the
phone/TV app of the same name), `packages/tv/src/workbench{,.web}.tsx`
(`?workbench` on the TV shells), and `clients/mobile/src/app/workbench.tsx`.

The **story SDK** has its own subpath, `@kroma/workbench/story`, so a
`*.story.mdx` declaring itself does not drag the whole tool into a bundle.
