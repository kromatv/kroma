import { act, render } from '@testing-library/react';
import { useContext } from 'react';
import { expect, it } from 'vitest';
import { createI18n } from '../i18n';
import { I18nContext, useT } from './context';
import { I18nProvider } from './provider.component';

function build() {
  return createI18n({
    catalogs: { en: { greeting: 'Hi' }, fr: { greeting: 'Bonjour' } },
    defaultLocale: 'en',
    lazy: { nav: { en: () => Promise.resolve({ 'nav.home': 'Home' }) } },
  });
}

function Home() {
  const t = useT();
  return <p>{t('nav.home')}</p>;
}

function useTWithoutSuspense() {
  return useContext(I18nContext)?.translator();
}

function Standalone() {
  const t = useTWithoutSuspense();
  return <p>{t?.('nav.home')}</p>;
}

function Own() {
  const t = useT('mod');
  return <p>{t('own')}</p>;
}

it('shows a message whose catalog lands after the first paint once the React Compiler memoizes the view', async () => {
  const i18n = build();

  const { container } = render(
    <I18nProvider i18n={i18n} locale="en">
      <Home />
    </I18nProvider>,
  );
  expect(container.textContent).toBe('nav.home');
  await act(() => i18n.ready('en'));

  expect(container.textContent).toBe('Home');
});

it('shows the rendered language once it lands over the fallback a memoized view painted', async () => {
  const i18n = build();
  i18n.register('nav', {
    en: { 'nav.home': 'Home' },
    fr: () => Promise.resolve({ 'nav.home': 'Accueil' }),
  });

  const { container } = render(
    <I18nProvider i18n={i18n} locale="fr">
      <Standalone />
    </I18nProvider>,
  );
  expect(container.textContent).toBe('Home');
  await act(() => i18n.ready('fr'));

  expect(container.textContent).toBe('Accueil');
});

it("shows a module's own message once the module adds its catalog under the React Compiler", () => {
  const i18n = build();

  const { container } = render(
    <I18nProvider i18n={i18n} locale="en">
      <Own />
    </I18nProvider>,
  );
  act(() => void i18n.add('mod', { en: { own: 'Mine' } }));

  expect(container.textContent).toBe('Mine');
});
