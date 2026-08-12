// A story as the INDEX knows it, which is not the same thing as the story.
//
// Listing a design system and drawing one component of it need different
// amounts of it: the tree, the palette and the source link want a name, a group
// and a file, while only the canvas wants the module that renders. Splitting the
// two is what lets a workbench show its whole library before it has fetched any
// of it.
//
// An eagerly discovered registry is this same shape with the fetching already
// done, so one shell serves Metro - where every module is in the bundle whatever
// anyone does about it - and Vite alike.

import { useEffect, useReducer } from 'react';
import type { Story } from './story';

/** One row of the index. */
interface StoryEntry {
  id: string;
  name: string;
  group: string;
  tier: string;
  /** Where the story was discovered, as the bundler spells it. */
  path?: string;
  /** The story where it is already in memory: discovered eagerly, or loaded
   * once before. A canvas handed one draws with no pending frame at all. */
  ready: () => Story | undefined;
  /** Compiles the story, loading its module the first time and handing back the
   * same promise after that, so two views of one story fetch it once. */
  load: () => Promise<Story>;
}

/** A registry as either half of discovery builds one: `discoverVite` and
 * `discoverMetro` hand over compiled stories, `indexVite` hands over an index
 * that fetches them. */
type Registry = readonly (Story | StoryEntry)[];

function isEntry(item: Story | StoryEntry): item is StoryEntry {
  return 'load' in item;
}

// An entry for a story that is already compiled: `ready` from the first render.
function held(story: Story): StoryEntry {
  return {
    id: story.id,
    name: story.name,
    group: story.group,
    tier: story.tier,
    path: story.path,
    ready: () => story,
    load: () => Promise.resolve(story),
  };
}

/** One entry per story, whichever half built the registry. Idempotent, so a
 * host and the shell it mounts can both normalise without paying twice. */
function storyEntries(registry: Registry): readonly StoryEntry[] {
  return registry.map((item) => (isEntry(item) ? item : held(item)));
}

/** Fetches what an entry names, and re-renders when it lands.
 *
 * Undefined only while a module is in flight: the answer is read from the entry
 * on every render rather than mirrored into state, so a story looked at a second
 * time never falls back through a pending frame. Pass a MEMOISED entry - a fresh
 * object each render would refetch each render. */
function useStory(entry: StoryEntry | undefined): Story | undefined {
  const [, arrived] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (!entry || entry.ready()) return;
    let live = true;
    const settled = () => {
      if (live) arrived();
    };
    entry.load().then(settled, settled);
    return () => {
      live = false;
    };
  }, [entry]);
  return entry?.ready();
}

export type { Registry, StoryEntry };
export { storyEntries, useStory };
