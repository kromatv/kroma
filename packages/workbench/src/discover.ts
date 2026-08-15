// Turns what a bundler found into a story registry: drop a `*.story.mdx` or a
// `*.demo.tsx` anywhere in the source tree and it appears here, nothing to
// register.
//
// The glob itself must live in the host, not this package: `import.meta.glob`
// (Vite) and `require.context` (Metro) are compile-time transforms resolved
// relative to the file that writes them, and this package is generic - it can't
// name one design system's tree. See discoverVite/discoverMetro below.

import type { ComponentType } from 'react';
import { attachDemos, type DemoFile } from './demos';
import { type PropDocs, propSections } from './props';
import { attachTiers, orderStories, pathsEnding } from './registry';
import type { Story } from './story';
import { STORY_MDX, type StoryMdxModule, storyFromMdx } from './story-mdx';

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

/** The two file names discovery answers to: a story, and a worked demo beside
 * it. */
const DEMO = '.demo.tsx';

// What the two bundlers disagree about is how a module is fetched, and nothing
// else: Metro simply hands over no source text and no prop docs, which the same
// arithmetic reads as a demo with no code panel and a component with no props.
type ModuleAt = <T>(path: string) => T;

function assemble(
  found: readonly string[],
  moduleAt: ModuleAt,
  sources: Sources,
  props: PropDocs,
): readonly Story[] {
  const demos: DemoFile[] = pathsEnding(found, DEMO).map((path) => ({
    path,
    component: moduleAt<{ default: ComponentType }>(path).default,
    source: sources[path],
  }));
  const paths = pathsEnding(found, STORY_MDX);
  const stories = paths.map((path) => {
    const story = storyFromMdx(moduleAt<StoryMdxModule>(path), path);
    // Matched by name: a story beside `button.tsx` is called `Button`, and a
    // compound one's parts are the keys under it.
    const documented = propSections(story.name, props);
    return { ...story, ...(documented.length ? { props: documented } : null), path };
  });
  return attachDemos(orderStories(attachTiers(stories, paths)), demos);
}

/** Assembles the registry from Vite's globs: `sources` (the `?raw` text glob)
 * gives a demo its code panel; `props` documents a component matched by name.
 * A `.story.mdx` arrives in `modules` as a module carrying its document, its
 * declaration and its lifted scenes, because that is what MDX compiles it to. */
function discoverVite(
  modules: Modules,
  sources: Sources = {},
  props: PropDocs = {},
): readonly Story[] {
  return assemble(Object.keys(modules), <T>(path: string) => modules[path] as T, sources, props);
}

/** Assembles the registry from Metro's context. A demo renders without a code
 * panel and the Props tab stays empty, since Metro can't hand a module its own
 * TEXT, rather than either carrying a stale hand-written copy. A `.story.mdx`
 * is not that case: its document AND its scenes' source travel inside the
 * compiled module, so both are whole here. */
function discoverMetro(context: Context): readonly Story[] {
  return assemble(context.keys(), context, {}, {});
}

export type { Context, GlobHost, Modules, PropDocs, Sources };
export { DEMO, discoverMetro, discoverVite, STORY_MDX };
