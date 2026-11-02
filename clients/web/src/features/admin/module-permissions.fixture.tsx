import type { Translate } from '@kromatv/i18n';
import { I18nProvider, useT } from '@kromatv/ui';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

/** The English translator the admin renders with, for tests that read its words. */
export function englishT(): Translate {
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <I18nProvider locale="en">{children}</I18nProvider>
  );
  return renderHook(() => useT(), { wrapper }).result.current;
}
