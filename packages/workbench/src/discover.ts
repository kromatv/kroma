// Turning what a bundler found into a registry.
//
// Stories are DISCOVERED, never listed: drop a `*.stories.tsx` anywhere in your
// source tree and it is in the workbench, and the same for a `*.demo.tsx`. There
// is no generated file to keep in step and nothing to register.
//
// What this package cannot do for you is the find itself, and the reason is worth
// stating once so nobody tries again. Discovery needs a BUNDLER primitive -
// `import.meta.glob` on Vite, `require.context` on Metro - and both are
// compile-time transforms resolved relative to THE FILE THAT WRITES THEM. Written
// in here they would search this package's own directory; and this package is
// GENERIC - it knows no design system - so it must not name one library's tree
// either. So the glob is the host's, and it is TWO LINES:
//
//   // the Vite half. `#ui` is an alias: a glob pattern resolves them, so no host
//   // has to count `../` from itself to the components.
//   import { PROPS } from 'virtual:kroma-props';
//   export const STORIES = discoverVite(
//     import.meta.glob('#ui/**\/*.{stories,demo}.tsx', { eager: true }),
//     import.meta.glob('#ui/**\/*.demo.tsx',
//       { eager: true, query: '?raw', import: 'default' }),
//     PROPS,
//   );
//
//   // the Metro half, which is one context
//   export const STORIES = discoverMetro(
//     require.context('../../ui/src', true, /\.(stories|demo)\.tsx$/),
//   );
//
// ONE glob for the modules and ONE for the text, rather than four: stories and
// demos are told apart by their own file names, in here, which is also what makes
// it impossible for a host to hand over demos and demo sources that disagree. The
// second argument is optional, and what it feeds - a demo's code panel - is simply
// absent without it.
//
// PROP DOCS are the third argument, and they are DATA rather than text. They used
// to be parsed out of the same `?raw` glob in the browser, which meant the glob
// had to cover every component (half a megabyte of source, inlined into the
// bundle and re-parsed before first paint) and meant a regex was standing in for
// a type checker - so it could not follow `extends` and a <Button> documented ten
// props while taking eighteen. A host now reads them from its bundler at BUILD
// time, where a checker is available; see `propDocs` in clients/tv-build. The
// argument is optional and the Props tab is simply absent without it, which is
// the honest state on Metro.
//
// Both the pattern AND the options must be written out as LITERALS at every call
// site, and `import.meta` may not be put in a local first: the call is found by
// matching the text `import.meta.glob(` and then replaced, so `vite.glob(...)`
// compiles fine, ships, and throws `glob is not a function` at runtime. An inline
// cast - `(import.meta as unknown as GlobHost).glob(...)` - keeps the text intact
// after the types are stripped, which is how a package with no `vite/client` in its
// tsconfig writes one (Vite also rejects a named options object: "Expected the
// second argument to be an object literal").
//
// The two bundlers differ in one honest way: Vite can read a file as text (`?raw`)
// and run a checker over the tree at build time; Metro can do neither. So demo
// sources and prop docs are present on the web and absent on a television -
// rather than stale on both, which is what a generated copy would give you.

import type { ComponentType } from 'react';
import { attachDemos, type DemoFile } from './demos';
import type { PropDoc } from './props';
import { attachTiers, orderStories, type Story } from './story';

/**
 * `import.meta.glob` is a Vite compile-time transform, not a runtime API, so it
 * has no types outside `vite/client`. Exported narrowed to the two shapes a host
 * needs, because a package that is ALSO compiled by Metro cannot put `vite/client`
 * in its tsconfig just to describe its web half:
 *
 *   (import.meta as unknown as GlobHost).glob('#ui/**\/*.stories.tsx', { eager: true })
 */
interface GlobHost {
  /** The files as TEXT. What makes a demo its own code sample, and what lets the
   *  inspector read a component's props out of its own JSDoc. */
  glob(pattern: string, options: { eager: true; query: '?raw'; import: 'default' }): Sources;
  glob(pattern: string, options: { eager: true }): Modules;
}

/** A module a bundler handed back, holding a default-exported story or demo. */
interface Module {
  default: unknown;
}

/** What Vite's eager `import.meta.glob` returns: path -> module. */
type Modules = Record<string, Module>;

/** What Vite's `?raw` glob returns: path -> the file's text. */
type Sources = Record<string, string>;

/** Component name -> its props, read by the host's bundler at build time. See
 * `propDocs` in clients/tv-build; the shape is `PropDoc[]` per component. */
type PropDocs = Record<string, readonly PropDoc[]>;

/** What Metro's `require.context` returns. */
interface Context {
  keys(): string[];
  <T>(id: string): T;
}

/** The two file names the workbench knows, and the only thing a host's single glob
 *  has to be split by. */
const STORY = '.stories.tsx';
const DEMO = '.demo.tsx';

/** Compares by UTF-16 code unit, which is what a bare `.sort()` does - stated
 *  explicitly because the ordering has to be a property of the code rather than
 *  of the machine. Deliberately NOT `localeCompare`: that orders by the host's
 *  locale, so the same story tree would come out in a different order on a
 *  developer's laptop than in CI, which is the exact instability the sort exists
 *  to remove. These are ASCII file paths, not prose to be shown to anyone. */
function byPath(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Sorted, always: the bundler's enumeration order must not leak into the sidebar,
 *  and the atomic level of each story is read from its PATH (`tierFor`), so the
 *  paths and the stories have to stay lined up. */
function pathsEnding(paths: readonly string[], suffix: string): string[] {
  return paths.filter((path) => path.endsWith(suffix)).sort(byPath);
}

/** The last, shared step: level the stories by folder, order them, attach the
 *  demos. Identical whichever bundler found the files. */
function assemble(
  paths: readonly string[],
  storyAt: (path: string) => Story,
  demos: readonly DemoFile[],
): readonly Story[] {
  return attachDemos(orderStories(attachTiers(paths.map(storyAt), paths)), demos);
}

/**
 * Assemble the registry from Vite's globs.
 *
 * `modules` is one eager glob of BOTH `*.stories.tsx` and `*.demo.tsx`; `sources`
 * is the same tree again as text (`query: '?raw'`), which is what gives a demo its
 * code panel and a component its Props tab - a story at
 * `.../button/button.stories.tsx` is documented from the component beside it at
 * `.../button/button.tsx`, so the convention IS the link and nothing is declared.
 */
function discoverVite(
  modules: Modules,
  sources: Sources = {},
  props: PropDocs = {},
): readonly Story[] {
  const found = Object.keys(modules);
  const demos: DemoFile[] = pathsEnding(found, DEMO).map((path) => ({
    path,
    component: (modules[path] as { default: ComponentType }).default,
    source: sources[path],
  }));
  return assemble(
    pathsEnding(found, STORY),
    (path) => {
      const story = (modules[path] as { default: Story }).default;
      // By NAME, because that is the one thing the story and the component
      // reliably share: a story sitting beside `button.tsx` is called `Button`
      // and documents `ButtonProps`. It is the same link the parser it replaced
      // used, so nothing about how a story is authored changed.
      const documented = props[story.name];
      return documented?.length ? { ...story, props: documented } : story;
    },
    demos,
  );
}

/**
 * Assemble the registry from Metro's context.
 *
 * One context, matching both file names: `require.context(dir, true,
 * /\.(stories|demo)\.tsx$/)`. No sources, because Metro cannot hand a module its
 * own text - so a demo renders without a code panel and the Props tab is empty,
 * rather than either of them carrying a hand-written copy that has drifted.
 */
function discoverMetro(context: Context): readonly Story[] {
  const found = context.keys();
  const demos: DemoFile[] = pathsEnding(found, DEMO).map((path) => ({
    path,
    component: context<{ default: ComponentType }>(path).default,
  }));
  return assemble(
    pathsEnding(found, STORY),
    (path) => context<{ default: Story }>(path).default,
    demos,
  );
}

export type { Context, GlobHost, Modules, PropDocs, Sources };
export { discoverMetro, discoverVite };
