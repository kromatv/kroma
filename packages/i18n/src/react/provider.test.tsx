// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { installKeyInspector, installLocaleOverride } from '../dev-overrides';
import { keyLabel } from '../devtools/key-label';
import { createI18n } from '../i18n';
import { useLocale, useT } from './context';
import { I18nProvider } from './provider';

const KEYS = ['screen.title', 'screen.subtitle', 'screen.action'] as const;
const DATA = 'Alien: Earth';

function build() {
  return createI18n({
    catalogs: {
      en: { 'screen.title': 'Downloads', 'screen.subtitle': 'Queue', 'screen.action': 'Add' },
      fr: {
        'screen.title': 'Téléchargements',
        'screen.subtitle': 'File',
        'screen.action': 'Ajouter',
      },
    },
    defaultLocale: 'en',
  });
}

// Holds the first string it is handed, which is what the React Compiler does to
// a component whose memoised value depends on nothing that moved.
function Frozen({ text }: Readonly<{ text: string }>) {
  const [first] = useState(text);
  return <li>{first}</li>;
}

function Screen() {
  const t = useT();
  const locale = useLocale();
  return (
    <ul>
      {KEYS.map((key) => (
        <Frozen key={key} text={t(key)} />
      ))}
      <Frozen text={DATA} />
      <Frozen text={new Intl.NumberFormat(locale).format(1234.5)} />
    </ul>
  );
}

function texts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
}

afterEach(() => {
  installKeyInspector(null);
  installLocaleOverride(null);
});

describe('a dev switch over a rendered screen', () => {
  it('turns every message into its key, and leaves what no catalog wrote alone', () => {
    const { container } = render(
      <I18nProvider i18n={build()} locale="en">
        <Screen />
      </I18nProvider>,
    );
    const before = texts(container);

    act(() => installKeyInspector(keyLabel));

    const after = texts(container);
    expect(after.filter((text, i) => text !== before[i])).toHaveLength(KEYS.length);
    expect(after.slice(0, KEYS.length)).toEqual(KEYS.map((key) => `[core/${key}]`));
    expect(after.at(-2)).toBe(DATA);
    expect(after.at(-1)).toBe(before.at(-1));
  });

  it('moves every message AND every formatter when the locale is the switch', () => {
    const { container } = render(
      <I18nProvider i18n={build()} locale="en">
        <Screen />
      </I18nProvider>,
    );
    const before = texts(container);

    act(() => installLocaleOverride('fr'));

    const after = texts(container);
    expect(after.slice(0, KEYS.length)).toEqual(['Téléchargements', 'File', 'Ajouter']);
    expect(after.at(-2)).toBe(DATA);
    expect(after.at(-1)).not.toBe(before.at(-1));
  });

  it('gives the locale back when the switch does', () => {
    const { container } = render(
      <I18nProvider i18n={build()} locale="en">
        <Screen />
      </I18nProvider>,
    );

    act(() => installLocaleOverride('fr'));
    act(() => installLocaleOverride(null));

    expect(texts(container).slice(0, KEYS.length)).toEqual(['Downloads', 'Queue', 'Add']);
  });
});
