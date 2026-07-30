// A module missing from the roster fails silently: the build passes, its own
// tests pass, and its routes and nav entries simply never exist.

import { generatedModules } from '@kroma/modules-generated';
import { describe, expect, it } from 'vitest';
import { moduleRegistry } from './registry';

function dependencyIds(deps: unknown): string[] {
  if (!deps) return [];
  if (Array.isArray(deps)) {
    return deps.map((d) => (typeof d === 'string' ? d : ((d as { id: string }).id ?? '')));
  }
  return Object.keys(deps as Record<string, unknown>);
}

describe('the compile-time modules', () => {
  it('are all registered', () => {
    // Spelled the way the backend crate's manifest spells them: the id is the
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
    // The roster is empty today, so this passes vacuously; it guards the first
    // generated module added.
    for (const module of generatedModules) {
      expect(moduleRegistry.has(module.id)).toBe(true);
    }
    expect(moduleRegistry.ids()).toEqual(expect.arrayContaining(generatedModules.map((m) => m.id)));
  });
});

describe('the roster as a whole', () => {
  it('is not empty', () => {
    expect(moduleRegistry.ids().length).toBeGreaterThan(0);
  });

  it('holds each id once', () => {
    const ids = moduleRegistry.ids();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('orders EVERY module, dropping none', () => {
    // `start()` iterates `order()`, so a module it drops never gets its setup()
    // run at all.
    const ordered = moduleRegistry.order().map((m) => m.id);
    expect([...ordered].sort()).toEqual([...moduleRegistry.ids()].sort());
  });

  it('places every dependency before the module that declares it', () => {
    const ordered = moduleRegistry.order().map((m) => m.id);
    for (const module of moduleRegistry.order()) {
      for (const dep of dependencyIds(module.dependsOn)) {
        if (!moduleRegistry.has(dep)) continue;
        expect(ordered.indexOf(dep)).toBeLessThan(ordered.indexOf(module.id));
      }
    }
  });

  it('gives every module an id and a version', () => {
    for (const module of moduleRegistry.order()) {
      expect(module.id).toBeTypeOf('string');
      expect(module.id).toBeTruthy();
      expect(module.version).toBeTruthy();
    }
  });
});

describe('what the roster contributes to the app', () => {
  it('registers no two routes at the same path', () => {
    const paths = moduleRegistry.routes().map((r) => r.path);
    // The registry keeps the first registrant on a collision, so a duplicate is
    // a screen the user can never reach.
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
      const target = item.to.replace(/^\/+/, '').split('/').pop() ?? item.to;
      expect(paths.has(item.to) || [...paths].some((p) => p.endsWith(target))).toBe(true);
    }
  });
});
