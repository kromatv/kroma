// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useCacheLimitName } from './cache-limit-name.hook';

function nameIn(locale: 'en' | 'fr') {
  const wrapper = (props: { children: ReactNode }) => (
    <I18nProvider locale={locale}>{props.children}</I18nProvider>
  );
  return renderHook(() => useCacheLimitName(), { wrapper }).result.current;
}

describe('useCacheLimitName', () => {
  it('names a stored size in the units of the language on screen', () => {
    const name = nameIn('en');

    expect(name('20 Go')).toBe('20 GB');
  });

  it('keeps the French units French', () => {
    const name = nameIn('fr');

    expect(name('20 Go')).toBe('20 Go');
  });

  it('names anything that is not a size as no limit', () => {
    const name = nameIn('en');

    expect([name('Illimité'), name('0 Go')]).toEqual(['Unlimited', 'Unlimited']);
  });
});
