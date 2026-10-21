// @vitest-environment jsdom
import { SHARED_MODULES } from '@kromatv/module-sdk';
import { describe, expect, it } from 'vitest';
import { provideShared } from './remotes';

const SCOPES: Record<string, [() => Promise<object>, () => Promise<object>]> = {
  '@kromatv/ui': [() => import('./scope/ui'), () => import('@kromatv/ui')],
  '@kromatv/ui/kit': [() => import('./scope/ui-kit'), () => import('@kromatv/ui/kit')],
  '@kromatv/ui/tokens': [() => import('./scope/ui-tokens'), () => import('@kromatv/ui/tokens')],
  '@kromatv/module-sdk': [() => import('./scope/module-sdk'), () => import('@kromatv/module-sdk')],
  '@kromatv/core': [() => import('./scope/core'), () => import('@kromatv/core')],
  '@kromatv/core/react': [() => import('./scope/core-react'), () => import('@kromatv/core/react')],
  '@kromatv/client': [() => import('./scope/client'), () => import('@kromatv/client')],
  '@kromatv/client/query': [
    () => import('./scope/client-query'),
    () => import('@kromatv/client/query'),
  ],
  '@kromatv/i18n': [() => import('./scope/i18n'), () => import('@kromatv/i18n')],
  '@kromatv/i18n/react': [() => import('./scope/i18n-react'), () => import('@kromatv/i18n/react')],
};

describe('the scope a runtime module receives', () => {
  for (const [specifier, [scope, barrel]] of Object.entries(SCOPES)) {
    it(`hands over every export of ${specifier}, as the same instances`, async () => {
      const given = await scope();
      const real = await barrel();

      const keys = (ns: object) =>
        Object.keys(ns)
          .filter((k) => k !== 'default')
          .sort();
      expect(keys(given)).toEqual(keys(real));
      for (const key of keys(real)) {
        expect(Reflect.get(given, key)).toBe(Reflect.get(real, key));
      }
    });
  }
});

describe('the shared map the host builds', () => {
  it('provides every shared specifier, with the members of the real module', async () => {
    const shared = await provideShared();

    for (const specifier of SHARED_MODULES) {
      expect(shared[specifier], specifier).toBeDefined();
    }
    const kit = await import('@kromatv/ui/kit');
    expect(Reflect.get(Object(shared['@kromatv/ui/kit']), 'Box')).toBe(kit.Box);
  });
});
