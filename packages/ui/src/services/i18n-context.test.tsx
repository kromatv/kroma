// @vitest-environment jsdom

import { DEFAULT_LOCALE } from '@kroma/core';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider, useLocale, useLocaleDefault, useSetLocale, useT } from './i18n';

const OTHER = DEFAULT_LOCALE === 'fr' ? 'en' : 'fr';

function wrapper(onLocaleChange?: (locale: string) => void) {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider locale={OTHER} onLocaleChange={onLocaleChange}>
      {children}
    </I18nProvider>
  );
}

describe('the i18n context', () => {
  it('reports the provider locale', () => {
    const { result } = renderHook(() => useLocale(), { wrapper: wrapper() });
    expect(result.current).toBe(OTHER);
  });

  it('translates through the provider locale', () => {
    const { result } = renderHook(() => useT(), { wrapper: wrapper() });
    expect(typeof result.current('common.close')).toBe('string');
  });

  it('bubbles a change request to onLocaleChange', () => {
    const onLocaleChange = vi.fn();
    const { result } = renderHook(() => useSetLocale(), { wrapper: wrapper(onLocaleChange) });
    result.current(DEFAULT_LOCALE);
    expect(onLocaleChange).toHaveBeenCalledWith(DEFAULT_LOCALE);
  });

  it('is a no-op when the provider was given no onLocaleChange', () => {
    const { result } = renderHook(() => useSetLocale(), { wrapper: wrapper() });
    expect(() => result.current(DEFAULT_LOCALE)).not.toThrow();
  });

  it('throws when a translating hook is read outside the provider', () => {
    expect(() => renderHook(() => useT())).toThrow(/<I18nProvider>/);
    expect(() => renderHook(() => useLocale())).toThrow(/<I18nProvider>/);
    expect(() => renderHook(() => useSetLocale())).toThrow(/<I18nProvider>/);
  });

  it('useLocaleDefault stands alone outside the provider', () => {
    const { result } = renderHook(() => useLocaleDefault());
    expect(result.current).toBe(DEFAULT_LOCALE);
  });

  it('useLocaleDefault still follows the provider when there is one', () => {
    const { result } = renderHook(() => useLocaleDefault(), { wrapper: wrapper() });
    expect(result.current).toBe(OTHER);
  });
});
