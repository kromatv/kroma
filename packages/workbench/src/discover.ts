// Turns what a bundler found into a story registry: drop a `*.stories.tsx`,
// `*.demo.tsx` or `*.docs.mdx` anywhere in the source tree and it appears here,
// nothing to register.
//
// The glob itself must live in the host, not this package: `import.meta.glob`
// (Vite) and `require.context` (Metro) are compile-time transforms resolved
// relative to the file that writes them, and this package is generic - it can't
// name one design system's tree. See discoverVite/discoverMetro below.

import type { ComponentType } from 'react';
import { attachDemos, type DemoFile } from './demos';
import type { PropDoc } from './props';
import { attachDocs, type DocsFile } from './prose';
import { attachTiers, type DocComponent, orderStories, type Story } from './story';

/** Narrows `import.meta.glob` (a Vite compile-time transform with no runtime
 * types) to the two shapes a host needs, so a package also built by Metro
 * doesn't need `vite/client` in its tsconfig. */
interface GlobHost {
  glob(pattern: string, options: { eager: true; query: '?raw'; import: 'default' }): Sources;
  glob(pattern: string, options: { eager: true }): Modules;
}

interface Module {
  default: unknown;
}

type Modules = Record<string, Module>;
type Sources = Record<string, string>;

/** Component name -> its props, read by the host's bundler at build time; see
 * `propDocs` in clients/tv-build. */
type PropDocs = Record<string, readonly PropDoc[]>;

interface Context {
  keys(): string[];
  <T>(id: string): T;
}

const STORY = '.stories.tsx';
const DEMO = '.demo.tsx';
const DOCS = '.docs.mdx';

// Deliberately not localeCompare: that orders by the host's locale, so the same
// tree would sort differently on a laptop than in CI.
function byPath(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// Sorted, always: a story's tier is read from its path, so paths and stories
// must stay lined up regardless of the bundler's enumeration order.
function pathsEnding(paths: readonly string[], suffix: string): string[] {
  return paths.filter((path) => path.endsWith(suffix)).sort(byPath);
}

function assemble(
  paths: readonly string[],
  storyAt: (path: string) => Story,
  demos: readonly DemoFile[],
  docs: readonly DocsFile[],
): readonly Story[] {
  return attachDocs(attachDemos(orderStories(attachTiers(paths.map(storyAt), paths)), demos), docs);
}

/** Assembles the registry from Vite's globs: `sources` (the `?raw` text glob)
 * gives a demo its code panel; `props` documents a component matched by name.
 * A `.docs.mdx` arrives in `modules` like any other module, because that is
 * what MDX compiles it to. */
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
  const docs: DocsFile[] = pathsEnding(found, DOCS).map((path) => ({
    path,
    content: (modules[path] as { default: DocComponent }).default,
  }));
  return assemble(
    pathsEnding(found, STORY),
    (path) => {
      const story = (modules[path] as { default: Story }).default;
      // Matched by name: a story beside `button.tsx` is called `Button`.
      const documented = props[story.name];
      return documented?.length ? { ...story, props: documented } : story;
    },
    demos,
    docs,
  );
}

/** Assembles the registry from Metro's context. A demo renders without a code
 * panel and the Props tab stays empty, since Metro can't hand a module its own
 * TEXT, rather than either carrying a stale hand-written copy. A `.docs.mdx` is
 * not that case: Metro compiles it to a component like any other module, so the
 * prose is whole here. */
function discoverMetro(context: Context): readonly Story[] {
  const found = context.keys();
  const demos: DemoFile[] = pathsEnding(found, DEMO).map((path) => ({
    path,
    component: context<{ default: ComponentType }>(path).default,
  }));
  const docs: DocsFile[] = pathsEnding(found, DOCS).map((path) => ({
    path,
    content: context<{ default: DocComponent }>(path).default,
  }));
  return assemble(
    pathsEnding(found, STORY),
    (path) => context<{ default: Story }>(path).default,
    demos,
    docs,
  );
}

export type { Context, GlobHost, Modules, PropDocs, Sources };
export { discoverMetro, discoverVite };
