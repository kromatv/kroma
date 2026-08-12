// Discovery under Vite, one navigation at a time.
//
// `discover.ts` executes every story file to learn what is in the library, which
// puts the whole library in the entry chunk: a reader who opens one component
// has downloaded a hundred and one. Here the LIST is built from two cheap
// things - the file paths, and what the build already read out of them
// (`virtual:kroma-story-code`) - and a story's module is fetched when someone
// navigates to it.
//
// The index has to carry a name and a group, and neither is derivable from a
// path: `components/molecules/` holds stories filed under Layout, Feedback,
// Input and Actions alike. That is why they are read at build time rather than
// guessed here; a build that read nothing falls back to the file name, which
// keeps every deep link working and only mis-files the sections.

import type { ComponentType } from 'react';
import { attachDemos, type DemoFile, demoOwner } from './demos';
import { DEMO, DOCS, STORY } from './discover';
import type { StoryEntry } from './entry';
import { type PropDocs, propSections } from './props';
import { attachDocs, type DocsFile, docsOwner } from './prose';
import { orderStories, pathsEnding, slug, tierFor } from './registry';
import type { DocComponent, Story } from './story';
import { codeAt, type StoryCode, type StoryCodes, withCode } from './story-code';

/** `import.meta.glob(pattern)` with no `eager`: one loader per matched file. */
type Loaders = Record<string, () => Promise<unknown>>;

/** The same glob through `?raw`, which is how a demo gets its code panel. */
type SourceLoaders = Record<string, () => Promise<string>>;

/** What a host hands the lazy index. Only `modules` is required; a workbench
 * missing any of the rest degrades exactly as Metro's does - no code panel, no
 * Props tab, sections read off the file names. */
interface LazyRegistry {
  /** `import.meta.glob('#ui/**\/*.{stories.tsx,demo.tsx,docs.mdx}')`. */
  modules: Loaders;
  /** The demos again, through `?raw`. */
  sources?: SourceLoaders;
  /** `virtual:kroma-story-code`: every story's declared name and group, and its
   *  authored source. This is the index. */
  codes?: StoryCodes;
  /** `virtual:kroma-props`, fetched with the first story rather than at start-up
   *  - it is the largest single thing the build emits and no list needs it. */
  props?: () => Promise<PropDocs>;
}

// One row of the index, before it is given the means to fetch itself.
interface Row {
  id: string;
  name: string;
  group: string;
  tier: string;
  path: string;
  code: StoryCode | undefined;
  demos: readonly string[];
  docs: string | undefined;
}

// Where a story with nothing read about it is filed. Sorts after every named
// section, which is where an unplaced thing belongs.
const UNFILED = 'Other';

// `.../list-row/list-row.stories.tsx` -> `ListRow`, whose slug is `list-row`
// again: a build that read no index still addresses every story the same way.
function nameFromPath(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1, -STORY.length);
  return file
    .split(/[-_.]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// The files that belong to each story, keyed by the id their own names claim.
function ownedBy(paths: readonly string[], owner: (path: string) => string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const path of paths) {
    const id = owner(path);
    const list = out.get(id);
    if (list) list.push(path);
    else out.set(id, [path]);
  }
  return out;
}

function loaderAt(modules: Loaders, path: string): () => Promise<unknown> {
  const at = modules[path];
  if (!at) throw new Error(`No module was globbed at "${path}".`);
  return at;
}

async function moduleAt<T>(modules: Loaders, path: string): Promise<T> {
  return (await loaderAt(modules, path)()) as T;
}

async function demoFile(registry: LazyRegistry, path: string): Promise<DemoFile> {
  const [module, source] = await Promise.all([
    moduleAt<{ default: ComponentType }>(registry.modules, path),
    registry.sources?.[path]?.(),
  ]);
  return { path, component: module.default, source };
}

async function docsFile(registry: LazyRegistry, path: string): Promise<DocsFile> {
  const module = await moduleAt<{ default: DocComponent }>(registry.modules, path);
  return { path, content: module.default };
}

// The story, its worked examples, its prose and its prop docs, fetched together
// and assembled by exactly the arithmetic the eager half uses. The ROW is
// authoritative about identity - the id the router already put in the address
// bar, the level its folder implies, the file it was found at - and the module
// about everything else.
async function compile(row: Row, registry: LazyRegistry): Promise<Story> {
  const [module, props, demos, docs] = await Promise.all([
    moduleAt<{ default: Story }>(registry.modules, row.path),
    registry.props?.() ?? Promise.resolve<PropDocs>({}),
    Promise.all(row.demos.map((path) => demoFile(registry, path))),
    row.docs ? docsFile(registry, row.docs) : undefined,
  ]);
  const story = module.default;
  const documented = propSections(story.name, props);
  const base = withCode(
    {
      ...story,
      ...(documented.length ? { props: documented } : null),
      id: row.id,
      tier: row.tier,
      path: row.path,
    },
    row.code,
  );
  const [ready] = attachDocs(attachDemos([base], demos), docs ? [docs] : []);
  return ready ?? base;
}

// The promise is kept, not the work: two views of one story, and a story
// returned to, fetch its module once. A failure is not kept, so a chunk lost to
// a dropped connection or a deploy mid-session is retried on the next visit
// rather than pinning that story to a spinner until the page is reloaded.
function entryOf(row: Row, registry: LazyRegistry): StoryEntry {
  let pending: Promise<Story> | undefined;
  let done: Story | undefined;
  return {
    id: row.id,
    name: row.name,
    group: row.group,
    tier: row.tier,
    path: row.path,
    ready: () => done,
    load: () => {
      pending ??= compile(row, registry).then(
        (story) => {
          done = story;
          return story;
        },
        (error: unknown) => {
          pending = undefined;
          throw error;
        },
      );
      return pending;
    },
  };
}

function rowAt(path: string, code: StoryCode | undefined): Omit<Row, 'demos' | 'docs'> {
  const name = code?.name ?? nameFromPath(path);
  return { id: slug(name), name, group: code?.group ?? UNFILED, tier: tierFor(path), path, code };
}

/**
 * The library as an index, with each story's module behind a `load()`.
 *
 * Everything a sidebar, a command palette and a source link ask for is here
 * from the first frame; opening a component is what fetches it. Ordered exactly
 * as `discoverVite` orders a registry, so the tree reads the same either way.
 */
function indexVite(registry: LazyRegistry): readonly StoryEntry[] {
  const paths = Object.keys(registry.modules);
  const codes = registry.codes ?? {};
  const rows = pathsEnding(paths, STORY).map((path) => rowAt(path, codeAt(codes, path)));
  const known = new Set(rows.map((row) => row.id));
  const demos = ownedBy(pathsEnding(paths, DEMO), (path) => demoOwner(path, known));
  const docs = ownedBy(pathsEnding(paths, DOCS), (path) => docsOwner(path, known));
  return orderStories(rows).map((row) =>
    entryOf({ ...row, demos: demos.get(row.id) ?? [], docs: docs.get(row.id)?.[0] }, registry),
  );
}

export type { LazyRegistry, Loaders, SourceLoaders };
export { indexVite, nameFromPath };
