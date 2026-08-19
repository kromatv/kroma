// The frontend module contract: a `@kroma/module-<id>` package exports one
// `KromaModule`, whose `id` must match its backend crate's module id.

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
  'requests.detail': { requestId: string; kind: 'movie' | 'show'; title: string; canGrab: boolean };
  /** Beside one episode row of the request page's catalogue: how far along the
   *  download of that episode is, if anything is downloading it. */
  'requests.episode.progress': { requestId: string; season: number; episode: number };
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
