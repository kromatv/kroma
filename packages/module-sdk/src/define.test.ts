import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import { defineModule, pageHref } from './define';
import type { ModuleComponentProps } from './module';

const Page = (() => null) as unknown as ComponentType<ModuleComponentProps>;

describe('pageHref', () => {
  it('mounts admin-section pages under /admin', () => {
    for (const section of [
      'management',
      'media',
      'acquisition',
      'system',
      'maintenance',
      'admin',
    ]) {
      expect(pageHref(section, 'thing')).toBe('/admin/thing');
    }
  });

  it('mounts every other section under the app root', () => {
    expect(pageHref('library', 'browse')).toBe('/browse');
  });

  it('strips leading slashes from the path', () => {
    expect(pageHref('library', '///deep/path')).toBe('/deep/path');
    expect(pageHref('system', '/settings')).toBe('/admin/settings');
  });
});

describe('defineModule', () => {
  it('builds a module from the explicit (manifest, options) form', () => {
    const m = defineModule(
      { id: 'x', version: '2.3.4', dependencies: { dep: '*' } },
      {
        pages: [
          { path: 'p1', component: Page, nav: { section: 'library', label: 'One' } },
          { path: 'p2', component: Page }, // no nav
        ],
      },
    );
    expect(m.id).toBe('x');
    expect(m.version).toBe('2.3.4');
    expect(m.dependencies).toEqual({ dep: '*' });
    expect(m.routes).toEqual([
      { path: 'p1', component: Page },
      { path: 'p2', component: Page },
    ]);
    // Only the page with `nav` produces a NavItem, and `to` is derived.
    expect(m.navItems).toEqual([{ section: 'library', label: 'One', to: '/p1' }]);
  });

  it('reads the manifest from options in the single-arg form', () => {
    const m = defineModule({ manifest: { id: 'y', version: '1.0.0' }, pages: [] });
    expect(m.id).toBe('y');
    // No pages => routes/navItems undefined (not empty arrays).
    expect(m.routes).toBeUndefined();
    expect(m.navItems).toBeUndefined();
  });

  it('lets explicit options.dependencies override the manifest deps', () => {
    const m = defineModule(
      { id: 'z', version: '1.0.0', dependencies: { a: '*' } },
      { dependencies: { b: '^2' }, optionalDependencies: { c: '*' } },
    );
    expect(m.dependencies).toEqual({ b: '^2' });
    expect(m.optionalDependencies).toEqual({ c: '*' });
  });

  it('throws when no manifest is available', () => {
    expect(() => defineModule({ pages: [] })).toThrow(/no manifest/);
  });

  it('normalizes path-keyed locales (import.meta.glob shape) to locale codes', () => {
    const m = defineModule({
      manifest: { id: 'l', version: '1.0.0' },
      locales: {
        '../../locales/en.json': { hi: 'Hi' },
        '../../locales/fr.json': { hi: 'Salut' },
      },
    });
    expect(m.locales).toEqual({ en: { hi: 'Hi' }, fr: { hi: 'Salut' } });
  });

  it('passes a plain { en, fr } locales map through unchanged', () => {
    const m = defineModule({
      manifest: { id: 'l', version: '1.0.0' },
      locales: { en: { a: '1' } },
    });
    expect(m.locales).toEqual({ en: { a: '1' } });
  });

  it('leaves locales undefined when none / empty are given', () => {
    expect(defineModule({ manifest: { id: 'l', version: '1.0.0' } }).locales).toBeUndefined();
    expect(
      defineModule({ manifest: { id: 'l', version: '1.0.0' }, locales: {} }).locales,
    ).toBeUndefined();
  });

  it('carries settingsPanels, exports and setup through', () => {
    const setup = () => undefined;
    const exportsFn = () => ({ ok: true });
    const panel = { id: 'pnl', label: 'P', component: Page };
    const m = defineModule({
      manifest: { id: 'w', version: '1.0.0' },
      settingsPanels: [panel],
      exports: exportsFn,
      setup,
    });
    expect(m.settingsPanels).toEqual([panel]);
    expect(m.exports).toBe(exportsFn);
    expect(m.setup).toBe(setup);
  });
});
