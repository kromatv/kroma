import { describe, expect, it, vi } from 'vitest';
import type { HostBase } from './host';
import type { KromaModule } from './module';
import { depEntries, ModuleRegistry } from './registry';
import type { ModuleManifest } from './types';

/** A tiny module builder; only the fields a given test needs are set. */
function mod(id: string, extra: Partial<KromaModule> = {}): KromaModule {
  return { id, version: '1.0.0', ...extra };
}

const baseHost: HostBase = {
  api: { get: async () => ({}) as never, listModules: async () => [] },
  auth: { userId: null, can: () => false },
  i18n: { t: (k: string) => k, locale: 'en' },
  nav: { navigate: () => undefined },
  bus: { emit: () => undefined, on: () => () => undefined },
} as unknown as HostBase;

describe('depEntries', () => {
  it('returns [] for undefined', () => {
    expect(depEntries(undefined)).toEqual([]);
  });

  it('normalizes a package.json-style map, dropping "*" ranges', () => {
    expect(depEntries({ a: '^1.0.0', b: '*' })).toEqual([
      { id: 'a', version: '^1.0.0' },
      { id: 'b', version: undefined },
    ]);
  });

  it('treats an empty-string range as no constraint', () => {
    expect(depEntries({ a: '' })).toEqual([{ id: 'a', version: undefined }]);
  });

  it('parses the legacy array form (bare id, id@range, object)', () => {
    expect(depEntries(['plain', 'scoped@^2.1.0', { id: 'obj', version: '3.0.0' }])).toEqual([
      { id: 'plain' },
      { id: 'scoped', version: '^2.1.0' },
      { id: 'obj', version: '3.0.0' },
    ]);
  });

  it('splits on the FIRST @ only and ignores a leading @', () => {
    expect(depEntries(['a@>=1@2'])).toEqual([{ id: 'a', version: '>=1@2' }]);
    // Leading '@' => at index 0 => whole string is the id.
    expect(depEntries(['@scope/pkg'])).toEqual([{ id: '@scope/pkg' }]);
  });
});

describe('ModuleRegistry register/unregister/has/ids', () => {
  it('registers and reports membership', () => {
    const r = new ModuleRegistry();
    expect(r.register(mod('a'))).toBe(r); // chainable
    expect(r.has('a')).toBe(true);
    expect(r.has('missing')).toBe(false);
    expect(r.ids()).toEqual(['a']);
  });

  it('throws on a duplicate registration', () => {
    const r = new ModuleRegistry();
    r.register(mod('a'));
    expect(() => r.register(mod('a'))).toThrow(/registered twice/);
  });

  it('unregister removes the module (idempotent on absent id)', () => {
    const r = new ModuleRegistry();
    r.register(mod('a'));
    r.unregister('a');
    expect(r.has('a')).toBe(false);
    expect(() => r.unregister('nope')).not.toThrow();
  });

  it('localesOf returns a module catalog or undefined', () => {
    const r = new ModuleRegistry();
    r.register(mod('a', { locales: { en: { hi: 'Hi' } } }));
    r.register(mod('b'));
    expect(r.localesOf('a')).toEqual({ en: { hi: 'Hi' } });
    expect(r.localesOf('b')).toBeUndefined();
    expect(r.localesOf('missing')).toBeUndefined();
  });
});

describe('ModuleRegistry.order (topological)', () => {
  it('orders dependencies before dependents', () => {
    const r = new ModuleRegistry();
    r.register(mod('c', { dependsOn: { b: '*' } }));
    r.register(mod('b', { dependsOn: { a: '*' } }));
    r.register(mod('a'));
    expect(r.order().map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('includes an optional dep as an edge only when present', () => {
    const r = new ModuleRegistry();
    r.register(mod('b', { optionalDependsOn: { a: '*' } }));
    r.register(mod('a'));
    expect(r.order().map((m) => m.id)).toEqual(['a', 'b']);

    const r2 = new ModuleRegistry();
    r2.register(mod('b', { optionalDependsOn: { ghost: '*' } }));
    // Missing optional dep is fine (no throw), just no edge.
    expect(r2.order().map((m) => m.id)).toEqual(['b']);
  });

  it('throws on a missing hard dependency', () => {
    const r = new ModuleRegistry();
    r.register(mod('b', { dependsOn: { a: '*' } }));
    expect(() => r.order()).toThrow(/depends on "a", which is not registered/);
  });

  it('throws on a dependency cycle', () => {
    const r = new ModuleRegistry();
    r.register(mod('a', { dependsOn: { b: '*' } }));
    r.register(mod('b', { dependsOn: { a: '*' } }));
    expect(() => r.order()).toThrow(/dependency cycle among \[a, b\]/);
  });
});

describe('ModuleRegistry.start', () => {
  it('runs setup in dependency order, exactly once each, skipping skipSetup', async () => {
    const r = new ModuleRegistry();
    const calls: string[] = [];
    r.register(mod('b', { dependsOn: { a: '*' }, setup: () => void calls.push('b') }));
    r.register(mod('a', { setup: () => void calls.push('a') }));
    r.register(mod('c', { setup: () => void calls.push('c') }));

    const host = await r.start(baseHost, new Set(['c']));
    expect(calls).toEqual(['a', 'b']); // c skipped
    expect(typeof host.getModuleApi).toBe('function');

    // Second start does NOT re-run setup (setupDone guard).
    await r.start(baseHost);
    expect(calls).toEqual(['a', 'b', 'c']); // only the previously-skipped c runs now
  });

  it('computes exports and exposes them via getModuleApi', async () => {
    const r = new ModuleRegistry();
    r.register(mod('a', { exports: () => ({ answer: 42 }) }));
    const host = await r.start(baseHost);
    // The registry is empty by design, so `getModuleApi`'s key is `never`; call
    // it through a string-keyed view to exercise it with runtime ids.
    const getModuleApi = host.getModuleApi as (id: string) => unknown;
    expect(getModuleApi('a')).toEqual({ answer: 42 });
    expect(getModuleApi('missing')).toBeUndefined();
  });

  it('awaits an async setup', async () => {
    const r = new ModuleRegistry();
    let done = false;
    r.register(
      mod('a', {
        setup: async () => {
          await Promise.resolve();
          done = true;
        },
      }),
    );
    await r.start(baseHost);
    expect(done).toBe(true);
  });
});

describe('ModuleRegistry route/nav/panel collection', () => {
  const comp = (() => null) as unknown as never;

  it('navItems and settingsPanels are tagged with their module id, in order', () => {
    const r = new ModuleRegistry();
    r.register(
      mod('b', {
        dependsOn: { a: '*' },
        navItems: [{ to: '/b', label: 'B' }],
        settingsPanels: [{ id: 'bp', label: 'B', component: comp as never }],
      }),
    );
    r.register(mod('a', { navItems: [{ to: '/a', label: 'A' }] }));
    expect(r.navItems()).toEqual([
      { to: '/a', label: 'A', moduleId: 'a' },
      { to: '/b', label: 'B', moduleId: 'b' },
    ]);
    expect(r.settingsPanels().map((p) => [p.id, p.moduleId])).toEqual([['bp', 'b']]);
  });

  it('routes keeps the first registrant and warns on a colliding path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = new ModuleRegistry();
    r.register(mod('a', { routes: [{ path: 'dup', component: comp as never }] }));
    r.register(mod('b', { routes: [{ path: 'dup', component: comp as never }] }));
    const routes = r.routes();
    expect(routes).toHaveLength(1);
    expect(routes[0]?.moduleId).toBe('a');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('collides'));
    warn.mockRestore();
  });
});

describe('ModuleRegistry.reconcile', () => {
  it('marks backend presence per registered frontend module', () => {
    const r = new ModuleRegistry();
    r.register(mod('a'));
    r.register(mod('b'));
    const manifest: ModuleManifest[] = [{ id: 'a', name: 'A', version: '1.0.0' }];
    expect(r.reconcile(manifest)).toEqual([
      { id: 'a', frontend: true, backend: true, manifest: manifest[0] },
      { id: 'b', frontend: true, backend: false, manifest: undefined },
    ]);
  });
});
