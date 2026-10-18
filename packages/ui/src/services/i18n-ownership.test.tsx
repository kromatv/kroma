// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, useTDefault } from './i18n';
import { type KitI18n, providerI18n } from './i18n-instance';

afterEach(cleanup);

function engine(word: string): KitI18n {
  return {
    ...providerI18n(),
    translator: () => (key: string) => (key === 'player.play' ? word : key),
  };
}

function scope(i18n: KitI18n) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <I18nProvider i18n={i18n} locale="en">
        {children}
      </I18nProvider>
    );
  };
}

function usePlayLabel() {
  return useTDefault()('player.play');
}

describe('app-owned kit catalogs', () => {
  it('uses each provider’s instance and leaves the other root intact on teardown', () => {
    const first = renderHook(usePlayLabel, { wrapper: scope(engine('First')) });
    const second = renderHook(usePlayLabel, { wrapper: scope(engine('Second')) });
    expect(first.result.current).toBe('First');
    expect(second.result.current).toBe('Second');
    first.unmount();
    second.rerender();
    expect(second.result.current).toBe('Second');
  });

  it('does not replace the standalone fallback after a custom root unmounts', () => {
    const before = renderHook(usePlayLabel).result.current;
    renderHook(usePlayLabel, { wrapper: scope(engine('Custom')) }).unmount();
    expect(renderHook(usePlayLabel).result.current).toBe(before);
  });
});
