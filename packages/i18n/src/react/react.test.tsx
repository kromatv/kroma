// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createI18n } from '../i18n';
import { useLocale, useScopedT, useT } from './context';
import { I18nProvider } from './provider';

function build() {
  return createI18n({
    catalogs: { en: { greeting: 'Hi' }, fr: { greeting: 'Bonjour' } },
    defaultLocale: 'en',
  });
}

function mount(i18n: ReturnType<typeof build>, locale: string, Probe: () => React.ReactNode) {
  return render(
    <I18nProvider i18n={i18n} locale={locale}>
      <Probe />
    </I18nProvider>,
  );
}

describe('I18nProvider', () => {
  it('translates in the locale it is given', () => {
    const i18n = build();

    const { container } = mount(i18n, 'fr', () => <>{useT()('greeting')}</>);

    expect(container.textContent).toBe('Bonjour');
  });

  it('hands the locale down', () => {
    const i18n = build();

    const { container } = mount(i18n, 'fr', () => <>{useLocale()}</>);

    expect(container.textContent).toBe('fr');
  });

  it('throws outside a provider rather than translating into nothing', () => {
    function Probe() {
      return <>{useT()('greeting')}</>;
    }

    expect(() => render(<Probe />)).toThrow(/within <I18nProvider>/);
  });
});

describe('a catalog added after first paint', () => {
  it('reaches a scoped translator without a remount', () => {
    const i18n = build();

    const { container } = mount(i18n, 'en', () => <>{useT('mod')('own')}</>);
    expect(container.textContent).toBe('own');

    act(() => void i18n.add('mod', { en: { own: 'Mine' } }));

    expect(container.textContent).toBe('Mine');
  });

  it('leaves an unscoped translator alone', () => {
    const i18n = build();

    const { container } = mount(i18n, 'en', () => <>{useT()('greeting')}</>);
    act(() => void i18n.add('mod', { en: { greeting: 'Yo' } }));

    expect(container.textContent).toBe('Hi');
  });

  it('reaches a factory rendering rows from several scopes', () => {
    const i18n = build();
    i18n.add('a', { en: { label: 'A' } });

    function Probe() {
      const tOf = useScopedT();
      return <>{['a', 'b'].map((id) => tOf(id)('label')).join('/')}</>;
    }
    const { container } = mount(i18n, 'en', Probe);
    expect(container.textContent).toBe('A/label');

    act(() => void i18n.add('b', { en: { label: 'B' } }));

    expect(container.textContent).toBe('A/B');
  });

  it('disappears again when its scope is disposed', () => {
    const i18n = build();
    const dispose = i18n.add('mod', { en: { own: 'Mine' } });

    const { container } = mount(i18n, 'en', () => <>{useT('mod')('own')}</>);
    expect(container.textContent).toBe('Mine');

    act(() => dispose());

    expect(container.textContent).toBe('own');
  });
});
