// `defineWorkbench`: the whole of a host's configuration, as data.
//
// The shell takes props, which is the right shape for a component and the wrong
// shape for a config file: a host that wanted a locale switch had to hold the
// locale in state, build a lens out of it, build a provider around it, memoise
// both, and keep the two ends agreeing. That is thirty lines of hooks in a file
// whose entire job is to say four facts, and every host would write the same
// thirty lines slightly differently.
//
// So this takes the facts and returns the COMPONENT. Everything with a lifecycle
// - the state behind a provider, the lens that changes it, the router adapter
// that must not be rebuilt per render - happens in here, once, correctly. A
// config file becomes declarative: no hooks, no memos, nothing to get wrong.
//
//   export const Kit = defineWorkbench({
//     stories: STORIES,
//     title: 'Kit',
//     brand: <Logo size={19} />,
//     provider: {
//       name: 'Language',
//       glyph: 'language',
//       values: [{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }],
//       render: (locale, onLocaleChange, children) => (
//         <I18nProvider locale={locale} onLocaleChange={onLocaleChange}>{children}</I18nProvider>
//       ),
//     },
//   });
//
// `<Kit />` is then the whole site.

import { type ReactNode, useMemo, useState } from 'react';
import { pathRouter, type WorkbenchRouter } from './router';
import { type Story, slug } from './story';
import type { Choice, ToolbarLens } from './toolbar';
import { Workbench } from './workbench';

/**
 * A CONTROLLED provider the workbench is wrapped in, and the values it can take.
 *
 * This exists because of a specific, recurring shape: an app context that every
 * story needs in order to render at all (KROMA's i18n provider - its translated
 * components call `useT()`, which throws outside one), whose value is also worth
 * flipping while looking at a design (the same components in French, where the
 * words are longer and layouts break first).
 *
 * Declaring it here gets both for one price: the workbench holds the state, wraps
 * the tree in your provider, AND puts a toolbar lens on it. The host writes no
 * hooks.
 */
interface ProviderSpec<T extends string> {
  /** Names the lens: "Language: English". */
  name: string;
  /** Menu glyph. */
  glyph?: NonNullable<ToolbarLens['glyph']>;
  /** Unique among the toolbar's menus. Defaults to a slug of `name`. */
  id?: string;
  /** The values, with the labels the menu shows. The first is the default. */
  values: readonly { value: T; label: string }[];
  /** Which to open with. Defaults to the first value. */
  initial?: T;
  /**
   * Wrap the workbench. Called with the current value, a setter, and the tree -
   * so the provider stays whatever shape your app already has, rather than
   * having to match an interface this package invented.
   */
  render: (value: T, set: (next: T) => void, children: ReactNode) => ReactNode;
}

interface WorkbenchDefinition<T extends string = string> {
  /** Every story to show. Build it with `discoverVite` / `discoverMetro`. */
  stories: readonly Story[];
  /** The mark at the top of the tree. Drawn as given; nothing without it. */
  brand?: ReactNode;
  /** The wordmark beside the mark. Defaults to naming the tool. */
  title?: string;
  /** Pinned under the story tree: a build stamp, a link, whatever this host
   * wants to say about itself. Nothing without it. */
  footer?: ReactNode;
  /**
   * How this mount is routed. Defaults to the `?story=&view=` search-param
   * contract, which degrades to memory where there is no DOM - so a native mount
   * needs nothing here, and one nested inside a host router wants
   * `memoryRouter()` (or `tanstackRouter()` to share the host's history).
   */
  router?: WorkbenchRouter;
  /** An app context every story needs, and the lens that changes it. */
  provider?: ProviderSpec<T>;
  /** Any further toolbar lenses, for state the host holds itself. */
  lenses?: readonly ToolbarLens[];
}

/**
 * Build the workbench component for one host.
 *
 * Everything expensive or stateful is resolved ONCE, here, outside any render:
 * the router adapter in particular, because an adapter is a hook and a fresh one
 * per render would remount the location it holds.
 */
function defineWorkbench<T extends string = string>(
  definition: WorkbenchDefinition<T>,
): () => ReactNode {
  const { stories, brand, title, footer, provider, lenses = [] } = definition;
  const router = definition.router ?? pathRouter();

  // No provider: nothing to hold, so the config really is just props.
  if (!provider) {
    return function ConfiguredWorkbench() {
      return (
        <Workbench
          stories={stories}
          brand={brand}
          title={title}
          footer={footer}
          lenses={lenses}
          router={router}
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
      <Workbench
        stories={stories}
        brand={brand}
        title={title}
        footer={footer}
        lenses={all}
        router={router}
      />,
    );
  };
}

export type { ProviderSpec, WorkbenchDefinition };
export { defineWorkbench };
