// Builds a `KromaModule` from a module's `module.json` plus a list of pages.

import type { ComponentType } from 'react';
import type { KromaHost } from './host';
import type {
  AnySlotContribution,
  KromaModule,
  ModuleComponentProps,
  NavItem,
  SettingsPanel,
} from './module';
import type { Dependencies } from './types';

const ADMIN_SECTIONS = new Set([
  'management',
  'media',
  'acquisition',
  'system',
  'maintenance',
  'admin',
]);

/** The absolute URL a module page lives at: admin sections under `/admin/<path>`,
 *  everything else under `/<path>`. The single source of truth, so the route and
 *  the nav link cannot drift. */
export function pageHref(section: string, path: string): string {
  const clean = path.replace(/^\/+/, '');
  return ADMIN_SECTIONS.has(section) ? `/admin/${clean}` : `/${clean}`;
}

/** One page a module contributes: a route, plus nav metadata when it should show
 *  in a sidebar. Omit `nav` for deep links and detail pages. */
export interface ModulePage {
  path: string;
  component: ComponentType<ModuleComponentProps>;
  nav?: Omit<NavItem, 'to'> & { section: string };
}

export interface ModuleManifestInput {
  id: string;
  version: string;
  dependsOn?: Dependencies;
  optionalDependsOn?: Dependencies;
}

export interface DefineModuleOptions<Exports = unknown> {
  manifest?: ModuleManifestInput;
  locales?: Record<string, Record<string, string>>;
  pages?: ModulePage[];
  settingsPanels?: SettingsPanel[];
  slots?: AnySlotContribution[];
  exports?: (host: KromaHost) => Exports;
  setup?: (host: KromaHost) => void | Promise<void>;
  dependsOn?: Dependencies;
  optionalDependsOn?: Dependencies;
}

/** Build a `KromaModule` from its manifest + pages. `defineModule({ pages })` has
 *  the manifest and locales injected by the `@kroma/module-sdk/vite` plugin;
 *  `defineModule(manifest, { pages })` is the explicit form for when it is off. */
export function defineModule<Exports = unknown>(
  manifestOrOptions: ModuleManifestInput | DefineModuleOptions<Exports>,
  maybeOptions?: DefineModuleOptions<Exports>,
): KromaModule<Exports> {
  const explicit = maybeOptions !== undefined;
  const options = (explicit ? maybeOptions : manifestOrOptions) as DefineModuleOptions<Exports>;
  const manifest = (explicit ? manifestOrOptions : options.manifest) as
    | ModuleManifestInput
    | undefined;
  if (!manifest) {
    throw new Error(
      'defineModule: no manifest. Pass it as the first argument, or enable the ' +
        '@kroma/module-sdk/vite plugin, which injects the manifest + locales by convention.',
    );
  }
  const pages = options.pages ?? [];
  const routes = pages.map((p) => ({ path: p.path, component: p.component }));
  const navItems: NavItem[] = pages.flatMap((p) =>
    p.nav ? [{ ...p.nav, to: pageHref(p.nav.section, p.path) }] : [],
  );
  return {
    id: manifest.id,
    version: manifest.version,
    dependsOn: options.dependsOn ?? manifest.dependsOn,
    optionalDependsOn: options.optionalDependsOn ?? manifest.optionalDependsOn,
    routes: routes.length > 0 ? routes : undefined,
    navItems: navItems.length > 0 ? navItems : undefined,
    settingsPanels: options.settingsPanels,
    slots: options.slots,
    locales: normalizeLocales(options.locales),
    exports: options.exports,
    setup: options.setup,
  };
}

function normalizeLocales(
  locales: DefineModuleOptions['locales'],
): Record<string, Record<string, string>> | undefined {
  if (!locales) return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [key, catalog] of Object.entries(locales)) {
    const code = key.replace(/^.*\//, '').replace(/\.json$/, '');
    out[code] = catalog;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
