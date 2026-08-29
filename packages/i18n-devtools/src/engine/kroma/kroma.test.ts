// @vitest-environment jsdom

import {
  createI18n,
  installAppLocales,
  installKeyInspector,
  installLocaleOverride,
} from '@kroma/i18n';
import { I18nProvider, useI18n, useLocale } from '@kroma/i18n/react';
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Rendered } from '../engine';
import { engine as kroma } from './kroma';

const VARS = { name: 'Ada', count: 2 };

function messages() {
  return createI18n({
    catalogs: {
      en: { greeting: 'Hi {name}, {count} left' },
      fr: { greeting: 'Salut {name}, il en reste {count}' },
    },
    defaultLocale: 'en',
  });
}

function watched(): Rendered[] {
  const seen: Rendered[] = [];
  kroma.inspect((rendered) => {
    seen.push(rendered);
    return rendered.text;
  });
  return seen;
}

function Greeting() {
  const locale = useLocale();
  return createElement('span', null, useI18n().translate(locale, 'greeting', VARS));
}

function screen(locale: 'en' | 'fr' = 'fr') {
  return render(
    createElement(I18nProvider, {
      i18n: messages(),
      locale,
      // biome-ignore lint/correctness/noChildrenProp: createElement types the provider's children as a required prop, and a .ts file cannot write JSX.
      children: createElement(Greeting),
    }),
  );
}

afterEach(() => {
  installKeyInspector(null);
  installLocaleOverride(null);
  installAppLocales(null);
});

describe('the KROMA engine, as the tools inspect it', () => {
  it('offers nothing until a provider says what it renders', () => {
    expect([kroma.locales(), kroma.activeLocale()]).toEqual([[], '']);
  });

  it('offers every locale the app ships, the default one first', () => {
    screen();

    expect(kroma.locales()).toEqual(['en', 'fr']);
  });

  it('reports the locale the app resolved for itself', () => {
    screen('fr');
    const before = kroma.activeLocale();

    screen('en');

    expect([before, kroma.activeLocale()]).toEqual(['fr', 'en']);
  });

  it('goes on reporting the resolved locale while an override is in force', () => {
    screen('fr');

    act(() => kroma.overrideLocale('en'));

    expect(kroma.activeLocale()).toBe('fr');
  });

  it('names the placeholders a message was given no value for', () => {
    const i18n = messages();
    const seen = watched();

    i18n.translate('en', 'greeting', { name: 'Ada' });

    expect(seen[0]?.holes).toEqual(['count']);
  });

  it('reports no hole once every placeholder has a value', () => {
    const i18n = messages();
    const seen = watched();

    i18n.translate('en', 'greeting', VARS);

    expect(seen[0]?.holes).toEqual([]);
  });

  it("carries the engine's own account of the message through untouched", () => {
    const i18n = messages();
    const seen = watched();

    i18n.translate('en', 'greeting', VARS);

    expect(seen[0]).toMatchObject({
      key: 'greeting',
      from: { scope: null, locale: 'en' },
      locale: 'en',
      text: 'Hi Ada, 2 left',
      vars: VARS,
    });
  });

  it('renders every message through the inspector it installs', () => {
    const i18n = messages();

    kroma.inspect(() => 'inspected');

    expect(i18n.translate('en', 'greeting', VARS)).toBe('inspected');
  });

  it('gives the plain text back when the inspector is taken away', () => {
    const i18n = messages();
    kroma.inspect(() => 'inspected');

    kroma.inspect(null);

    expect(i18n.translate('en', 'greeting', VARS)).toBe('Hi Ada, 2 left');
  });

  it('moves a mounted screen to the locale it is asked for', () => {
    const { container } = screen();

    act(() => kroma.overrideLocale('en'));

    expect(container.textContent).toBe('Hi Ada, 2 left');
  });

  it('gives the app its own locale back when the override is dropped', () => {
    const { container } = screen();
    act(() => kroma.overrideLocale('en'));

    act(() => kroma.overrideLocale(null));

    expect(container.textContent).toBe('Salut Ada, il en reste 2');
  });
});
