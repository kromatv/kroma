// The web app's module roster.
//
// Adding a module is one import and one `register()` line, and forgetting the
// second half is silent in the worst way: the package builds, the module's own
// tests pass, its routes and nav entries simply never exist, and the feature
// reads as "not implemented yet" rather than as a missing line. Nothing else in
// the app names these modules, so nothing else can notice.
//
// The generated tier is the other half. Single-file modules register themselves
// through a codegen roster, so a module added there has no line here at all -
// which means the only thing that can check it arrived is a test comparing the
// roster to what the registry ended up holding.
//
// Importing this file is itself the check that the modules LOAD: each entry
// calls `defineModule({ ... })` with no manifest of its own, and the build
// plugin fills that in by convention. A module in the wrong folder shape throws
// on import here rather than at whichever screen first renders it.

import { generatedModules } from '@kroma/modules-generated';
import { describe, expect, it } from 'vitest';
import { moduleRegistry } from './registry';

/** The ids a module depends on, in either spelling: a `{ id: range }` map, or
 *  the legacy array (whose entries are `{ id }` records, not bare strings). */
function dependencyIds(deps: unknown): string[] {
  if (!deps) return [];
  if (Array.isArray(deps)) {
    return deps.map((d) => (typeof d === 'string' ? d : ((d as { id: string }).id ?? '')));
  }
  return Object.keys(deps as Record<string, unknown>);
}

describe('the compile-time modules', () => {
  it('are all registered', () => {
    // The tier that ships today and works on every target, including the
    // Chromium-53 televisions.
    // Spelled the way the backend crate's manifest spells them - the id is the
    // shared key, not a display name.
    for (const id of [
      'tv.kroma.indexer',
      'tv.kroma.torrents',
      'tv.kroma.vpn',
      'tv.kroma.remote',
      'tv.kroma.acquisition',
    ]) {
      expect(moduleRegistry.has(id)).toBe(true);
    }
  });
});

describe('the generated modules', () => {
  it('all arrive through the roster', () => {
    // A single-file module has no line in registry.ts, so this is the only
    // place its arrival can be checked. The roster is empty today, which makes
    // this a guard for the first one added rather than a check of anything
    // present - stated here so an empty pass is not mistaken for a real one.
    for (const module of generatedModules) {
      expect(moduleRegistry.has(module.id)).toBe(true);
    }
    expect(moduleRegistry.ids()).toEqual(expect.arrayContaining(generatedModules.map((m) => m.id)));
  });
});

describe('the roster as a whole', () => {
  it('is not empty', () => {
    // An empty roster is an app with no module features at all, and it looks
    // exactly like an app whose features are still loading.
    expect(moduleRegistry.ids().length).toBeGreaterThan(0);
  });

  it('holds each id once', () => {
    const ids = moduleRegistry.ids();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('orders EVERY module, dropping none', () => {
    // `order()` is a dependency walk, and it is what `start()` iterates. A
    // module it fails to place is one whose setup() never runs - present in the
    // roster, absent from the app.
    const ordered = moduleRegistry.order().map((m) => m.id);
    expect([...ordered].sort()).toEqual([...moduleRegistry.ids()].sort());
  });

  it('places every dependency before the module that declares it', () => {
    const ordered = moduleRegistry.order().map((m) => m.id);
    for (const module of moduleRegistry.order()) {
      for (const dep of dependencyIds(module.dependsOn)) {
        if (!moduleRegistry.has(dep)) continue;
        // `exports()` is computed in this order, so a module reaching for a
        // dependency's API before it exists gets undefined.
        expect(ordered.indexOf(dep)).toBeLessThan(ordered.indexOf(module.id));
      }
    }
  });

  it('gives every module an id and a version', () => {
    for (const module of moduleRegistry.order()) {
      // The id is shared with the backend crate's manifest and is what
      // `getModuleApi` and the dependency ordering key on.
      expect(module.id).toBeTypeOf('string');
      expect(module.id).toBeTruthy();
      expect(module.version).toBeTruthy();
    }
  });
});

describe('what the roster contributes to the app', () => {
  it('registers no two routes at the same path', () => {
    const paths = moduleRegistry.routes().map((r) => r.path);
    // The registry keeps the first registrant and warns on a collision, so a
    // duplicate here is a screen the user can never reach.
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('stamps every route and panel with the module it came from', () => {
    for (const route of moduleRegistry.routes()) {
      expect(route.moduleId).toBeTruthy();
      expect(moduleRegistry.has(route.moduleId)).toBe(true);
    }
    for (const panel of moduleRegistry.settingsPanels()) {
      expect(panel.moduleId).toBeTruthy();
      expect(moduleRegistry.has(panel.moduleId)).toBe(true);
    }
  });

  it('points every nav entry at a route that exists', () => {
    const paths = new Set(moduleRegistry.routes().map((r) => r.path));
    for (const item of moduleRegistry.navItems()) {
      // A nav entry to nowhere is a menu row that lands on the not-found page.
      const target = item.to.replace(/^\/+/, '').split('/').pop() ?? item.to;
      expect(paths.has(item.to) || [...paths].some((p) => p.endsWith(target))).toBe(true);
    }
  });
});
