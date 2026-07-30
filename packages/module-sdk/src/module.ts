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

export interface KromaModule<Exports = unknown> {
  id: string;
  version: string;
  // Version ranges are enforced on the backend; the frontend uses the id for
  // setup ordering.
  dependsOn?: Dependencies;
  optionalDependsOn?: Dependencies;
  routes?: RouteDef[];
  navItems?: NavItem[];
  settingsPanels?: SettingsPanel[];
  // Keyed by locale code then message key. Resolved before the core catalogs,
  // so a module ships translations without touching the app's typed key union.
  locales?: Record<string, Record<string, string>>;
  // Reached by other modules via `host.getModuleApi(id)`; computed once at
  // start, in dependency order.
  exports?: (host: KromaHost) => Exports;
  setup?: (host: KromaHost) => void | Promise<void>;
}
