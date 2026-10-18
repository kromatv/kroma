// The frontend module contract: a `@kromatv/module-<id>` package exports one
// `KromaModule`, whose `id` must match its backend crate's module id.

import type { RequestId } from '@kromatv/client/requests';
import type { ComponentType } from 'react';
import type { KromaHost } from './host';
import type { Dependencies } from './types';

export interface NavItem {
  to: string;
  label: string;
  icon?: string;
  section?: string;
  requires?: string;
}

export interface ModuleComponentProps {
  host: KromaHost;
}

/** A route registered under the host's module mount point. */
export interface RouteDef {
  path: string;
  // Wrap in `React.lazy` so each module is its own chunk.
  component: ComponentType<ModuleComponentProps>;
}

export interface SettingsPanel {
  id: string;
  label: string;
  component: ComponentType<ModuleComponentProps>;
}

/**
 * A place a CORE page opens for modules to fill.
 *
 * The core cannot import a module -- it does not know which are installed, and
 * a page that named one would break the moment it was disabled. So the page
 * renders a named slot and passes it props; a module answers the name. The name
 * is the contract between them, and its props are declared in {@link SlotProps}.
 */
export interface SlotContribution<Name extends SlotName = SlotName> {
  slot: Name;
  component: ComponentType<SlotProps[Name]>;
  /** Lower renders first when several modules fill one slot. Defaults to 0. */
  order?: number;
}

/**
 * Every slot a core page opens, and what it hands whoever fills it.
 *
 * Declared here so both sides typecheck against one definition: a core page
 * cannot pass props no module expects, and a module cannot claim a slot that
 * does not exist. Adding a slot is a change to this map first.
 */
export interface SlotProps {
  /** The acquisition half of the admin request page: search for releases of
   *  this request and grab one. Everything about indexers, releases and
   *  downloads lives behind it. */
  'requests.detail': {
    requestId: RequestId;
    kind: 'movie' | 'show';
    title: string;
    canGrab: boolean;
  };
  /** Beside one episode row of the request page's catalogue: how far along the
   *  download of that episode is, if anything is downloading it. */
  'requests.episode.progress': { requestId: RequestId; season: number; episode: number };
  /** The acquisition half of the admin page of one title: which quality profile
   *  judges it, how its files measure up, and a search for a better copy.
   *  `monitored` is false for a library title nobody monitors yet. */
  'monitoring.detail': {
    kind: 'movie' | 'show';
    tmdbId: number;
    title: string;
    monitored: boolean;
  };
  /** The search actions for one title, one season or one episode, wherever a
   *  core page lists them: an automatic search and a hand-picked one. `season`
   *  and `episode` narrow the search; both null searches the whole title.
   *  `compact` asks for icon buttons that fit a table row. */
  /** The library page's « À améliorer » tab: titles that hold a copy the
   *  server would still replace. The tab shows only when a module fills it. */
  'library.upgrades': Record<never, never>;
  'monitoring.search': {
    kind: 'movie' | 'show';
    tmdbId: number;
    title: string;
    season: number | null;
    episode: number | null;
    compact: boolean;
  };
}

export type SlotName = keyof SlotProps;

/** A contribution to SOME slot, each element matched to its own slot's props.
 *  `SlotContribution` alone would default to the union of every slot's props and
 *  demand a component that accepts all of them at once. */
export type AnySlotContribution = { [Name in SlotName]: SlotContribution<Name> }[SlotName];

export interface KromaModule<Exports = unknown> {
  id: string;
  version: string;
  // Version ranges are enforced on the backend; the frontend uses the id for
  // setup ordering.
  dependencies?: Dependencies;
  optionalDependencies?: Dependencies;
  routes?: RouteDef[];
  navItems?: NavItem[];
  settingsPanels?: SettingsPanel[];
  // What this module contributes to the core pages that opened a slot for it.
  slots?: AnySlotContribution[];
  // Keyed by locale code then message key. Resolved before the core catalogs,
  // so a module ships translations without touching the app's typed key union.
  locales?: Record<string, Record<string, string>>;
  // Reached by other modules via `host.getModuleApi(id)`; computed once at
  // start, in dependency order.
  exports?: (host: KromaHost) => Exports;
  setup?: (host: KromaHost) => void | Promise<void>;
}
