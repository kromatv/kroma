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
import { type PropDocs, propSections } from './props';
import { attachDocs, type DocsFile } from './prose';
import { attachTiers, byText, orderStories } from './registry';
import type { DocComponent, Story } from './story';
import { codeAt, type StoryCodes, withCode } from './story-code';

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

interface Context {
  keys(): string[];
  <T>(id: string): T;
}

const STORY = '.stories.tsx';
const DEMO = '.demo.tsx';
const DOCS = '.docs.mdx';

// Sorted, always: a story's tier is read from its path, so paths and stories
// must stay lined up regardless of the bundler's enumeration order.
function pathsEnding(paths: readonly string[], suffix: string): string[] {
  return paths.filter((path) => path.endsWith(suffix)).sort(byText);
}

// What the two bundlers disagree about is how a module is fetched, and nothing
// else: Metro simply hands over no source text and no prop docs, which the same
// arithmetic reads as a demo with no code panel and a component with no props.
type ModuleAt = <T>(path: string) => T;

function assemble(
  found: readonly string[],
  moduleAt: ModuleAt,
  sources: Sources,
  props: PropDocs,
  codes: StoryCodes,
): readonly Story[] {
  const demos: DemoFile[] = pathsEnding(found, DEMO).map((path) => ({
    path,
    component: moduleAt<{ default: ComponentType }>(path).default,
    source: sources[path],
  }));
  const docs: DocsFile[] = pathsEnding(found, DOCS).map((path) => ({
    path,
    content: moduleAt<{ default: DocComponent }>(path).default,
  }));
  const paths = pathsEnding(found, STORY);
  const stories = paths.map((path) => {
    const story = moduleAt<{ default: Story }>(path).default;
    // Matched by name: a story beside `button.tsx` is called `Button`, and a
    // compound one's parts are the keys under it.
    const documented = propSections(story.name, props);
    return withCode(
      { ...story, ...(documented.length ? { props: documented } : null), path },
      codeAt(codes, path),
    );
  });
  return attachDocs(attachDemos(orderStories(attachTiers(stories, paths)), demos), docs);
}

/** Assembles the registry from Vite's globs: `sources` (the `?raw` text glob)
 * gives a demo its code panel; `props` documents a component matched by name;
 * `codes` is every story's own JSX, read at build time, which is what a scene
 * shows in the drawer under it. A `.docs.mdx` arrives in `modules` like any
 * other module, because that is what MDX compiles it to. */
function discoverVite(
  modules: Modules,
  sources: Sources = {},
  props: PropDocs = {},
  codes: StoryCodes = {},
): readonly Story[] {
  return assemble(
    Object.keys(modules),
    <T>(path: string) => modules[path] as T,
    sources,
    props,
    codes,
  );
}

/** Assembles the registry from Metro's context. A demo renders without a code
 * panel, a scene shows no source and the Props tab stays empty, since Metro
 * can't hand a module its own TEXT, rather than any of the three carrying a
 * stale hand-written copy. A `.docs.mdx` is not that case: Metro compiles it to
 * a component like any other module, so the prose is whole here. */
function discoverMetro(context: Context): readonly Story[] {
  return assemble(context.keys(), context, {}, {}, {});
}

export type { Context, GlobHost, Modules, PropDocs, Sources, StoryCodes };
export { discoverMetro, discoverVite };
