// `defineWorkbench`: the whole of a host's configuration, as data.
//
// The shell takes props, which is the wrong shape for a config file: a host
// that wanted a locale switch would have to hold state, build a lens, build a
// provider, and keep the two ends agreeing. This takes the facts and returns
// the COMPONENT instead: everything with a lifecycle - the state behind a
// provider, the lens that changes it, the router adapter that must not be
// rebuilt per render - happens once, in here, so the host writes no hooks.

import { type ReactNode, useMemo, useState } from 'react';
import { type Registry, type StoryEntry, storyEntries } from './entry';
import type { Page } from './page';
import { slug } from './registry';
import { pathRouter, type WorkbenchRouter } from './router';
import { SourceProvider, type StorySource, useSourceLink } from './source';
import type { Choice, ToolbarLens } from './toolbar';
import { Workbench, type WorkbenchProps } from './workbench';

// A CONTROLLED provider the workbench is wrapped in, and the values it can take. This exists
// because of a specific, recurring shape: an app context that every story needs in order to
// render at all (KROMA's i18n provider - its translated components call `useT()`, which throws
// outside one), whose value is also worth flipping while looking at a design (the same
// components in French, where the words are longer and layouts break first). Declaring it here
// gets both for one price: the workbench holds the state, wraps the tree in your provider, AND
// puts a toolbar lens on it. The host writes no hooks.
interface ProviderSpec<T extends string> {
  name: string;
  glyph?: NonNullable<ToolbarLens['glyph']>;
  // Unique among the toolbar's menus. Defaults to a slug of `name`.
  id?: string;
  // The first value is the default.
  values: readonly { value: T; label: string }[];
  // Defaults to the first value.
  initial?: T;
  // Called with the current value, a setter, and the tree - so the provider
  // stays whatever shape the app already has, rather than matching an
  // interface this package invented.
  render: (value: T, set: (next: T) => void, children: ReactNode) => ReactNode;
}

interface WorkbenchDefinition<T extends string = string> {
  // Build it with `indexVite`, which fetches a story when a reader opens it, or
  // with `discoverVite` / `discoverMetro`, which compile the lot up front.
  stories: Registry;
  // Standalone articles, built with `discoverPagesVite` / `discoverPagesMetro`.
  pages?: readonly Page[];
  brand?: ReactNode;
  title?: string;
  footer?: ReactNode;
  // Defaults to `pathRouter()`: real paths on the History API, degrading to
  // memory where there is no DOM. A mount nested inside a host router wants
  // `memoryRouter()`, or `tanstackRouter()` to share the host's history; a
  // shell loaded off the filesystem wants `searchParamsRouter()`.
  router?: WorkbenchRouter;
  provider?: ProviderSpec<T>;
  lenses?: readonly ToolbarLens[];
  // Where the stories' own code is published, and the revision this build was
  // made from. Given one, the toolbar carries a link to the open component's
  // source, pinned to that revision; without it there is no link.
  source?: StorySource;
}

// The shell with the source link wired around it. Its own component because
// `useSourceLink` is a hook and both roads out of `defineWorkbench` need it.
function Mounted({
  source,
  router,
  stories,
  ...rest
}: Readonly<
  Omit<WorkbenchProps, 'router' | 'stories'> & {
    stories: readonly StoryEntry[];
    router: WorkbenchRouter;
    source?: StorySource;
  }
>) {
  const link = useSourceLink(source, stories, router);
  return (
    <SourceProvider binding={link.binding}>
      <Workbench {...rest} stories={stories} router={link.router} />
    </SourceProvider>
  );
}

// Build the workbench component for one host. Everything expensive or stateful is resolved
// ONCE, here, outside any render: the router adapter in particular, because an adapter is a
// hook and a fresh one per render would remount the location it holds.
function defineWorkbench<T extends string = string>(
  definition: WorkbenchDefinition<T>,
): () => ReactNode {
  const { pages, brand, title, footer, provider, source, lenses = [] } = definition;
  // Once, out here: the index is what the sidebar and the source link read, and
  // rebuilding it per render would refetch the open story on every one.
  const stories = storyEntries(definition.stories);
  const router = definition.router ?? pathRouter();

  // No provider: nothing to hold, so the config really is just props.
  if (!provider) {
    return function ConfiguredWorkbench() {
      return (
        <Mounted
          stories={stories}
          pages={pages}
          brand={brand}
          title={title}
          footer={footer}
          lenses={lenses}
          router={router}
          source={source}
        />
      );
    };
  }

  const first = provider.values[0]?.value as T;
  const choices: Choice<string>[] = provider.values.map(({ value, label }) => ({ value, label }));
  const lensId = provider.id ?? slug(provider.name);

  return function ConfiguredWorkbench() {
    const [value, setValue] = useState<T>(provider.initial ?? first);
    // The provider's lens, and the host's own, in one list. Built here rather
    // than in the config so a host never has to thread state into a lens.
    const all = useMemo<ToolbarLens[]>(
      () => [
        {
          id: lensId,
          name: provider.name,
          glyph: provider.glyph,
          choices,
          value,
          // The toolbar speaks in plain strings, because it has no idea what the
          // values mean; `values` above is the only thing that can put one in.
          onChange: (next) => setValue(next as T),
        },
        ...lenses,
      ],
      [value],
    );
    return provider.render(
      value,
      setValue,
      <Mounted
        stories={stories}
        pages={pages}
        brand={brand}
        title={title}
        footer={footer}
        lenses={all}
        router={router}
        source={source}
      />,
    );
  };
}

export type { ProviderSpec, WorkbenchDefinition };
export { defineWorkbench };
