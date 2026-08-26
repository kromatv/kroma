// @vitest-environment jsdom

import type { Locale } from '@kroma/core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFormat } from './format';
import { I18nProvider } from './i18n';

function read(locale: Locale, pick: (f: ReturnType<typeof useFormat>) => string): string {
  function Probe() {
    return <>{pick(useFormat())}</>;
  }
  return render(
    <I18nProvider locale={locale}>
      <Probe />
    </I18nProvider>,
  ).container.textContent;
}

describe('useFormat', () => {
  it('binds the byte units to the locale on screen', () => {
    expect(read('fr', (f) => f.bytes(1024 ** 3))).toBe('1,0 Go');
    expect(read('en', (f) => f.bytes(1024 ** 3))).toBe('1.0 GB');
  });

  it('binds the decimal separator, and takes a digit count', () => {
    expect(read('fr', (f) => f.decimal(1.25, 2))).toBe('1,25');
    expect(read('en', (f) => f.decimal(1.25, 2))).toBe('1.25');
  });

  it('reads the relative and uptime wording out of the catalogs', () => {
    expect(read('fr', (f) => f.elapsed(null))).toBe('jamais');
    expect(read('en', (f) => f.elapsed(null))).toBe('never');
    expect(read('fr', (f) => f.uptime(18 * 86400 + 4 * 3600))).toBe('18 j 04 h');
    expect(read('en', (f) => f.uptime(18 * 86400 + 4 * 3600))).toBe('18 d 04 h');
  });

  it('formats a timecode the same in either language', () => {
    expect(read('fr', (f) => f.timecode(3_847_000))).toBe('1:04:07');
    expect(read('en', (f) => f.timecode(3_847_000))).toBe('1:04:07');
  });

  it('answers in the default locale above a provider instead of throwing', () => {
    function Probe() {
      const f = useFormat();
      return <>{`${f.bytes(1024 ** 3)} ${f.elapsed(null)}`}</>;
    }

    expect(render(<Probe />).container.textContent).toBe('1,0 Go jamais');
  });

  it('keeps one identity while the locale holds still', () => {
    const seen: Array<ReturnType<typeof useFormat>> = [];
    function Probe() {
      seen.push(useFormat());
      return null;
    }
    const tree = () => (
      <I18nProvider locale="fr">
        <Probe />
      </I18nProvider>
    );

    const { rerender } = render(tree());
    rerender(tree());

    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]).toBe(seen[seen.length - 1]);
  });
});
