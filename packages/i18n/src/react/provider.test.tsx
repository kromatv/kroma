// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { installKeyInspector, installLocaleOverride } from '../dev-overrides';
import { createI18n } from '../i18n';
import { useLocale, useT } from './context';
import { I18nProvider } from './provider';

const asKey = ({ key }: { key: string }) => `[${key}]`;

const KEYS = ['screen.title', 'screen.subtitle', 'screen.action'] as const;
const DATA = 'Alien: Earth';

let mounts = 0;

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

// Whatever it drew the first time. A remount of the tree above would throw it
// away, and with it the screen's scroll, its route and the art it had picked.
function Kept() {
  const [at] = useState(() => ++mounts);
  return <li>{`mount ${at}`}</li>;
}

function Screen() {
  const t = useT();
  const locale = useLocale();
  return (
    <ul>
      {KEYS.map((key) => (
        <li key={key}>{t(key)}</li>
      ))}
      <li>{DATA}</li>
      <li>{new Intl.NumberFormat(locale).format(1234.5)}</li>
      <Kept />
    </ul>
  );
}

function texts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
}

function screen() {
  mounts = 0;
  return render(
    <I18nProvider i18n={build()} locale="en">
      <Screen />
    </I18nProvider>,
  );
}

afterEach(() => {
  installKeyInspector(null);
  installLocaleOverride(null);
});

describe('a dev switch over a rendered screen', () => {
  it('turns every message into its key, and leaves what no catalog wrote alone', () => {
    const { container } = screen();
    const before = texts(container);

    act(() => installKeyInspector(asKey));

    const after = texts(container);
    expect(after.filter((text, i) => text !== before[i])).toHaveLength(KEYS.length);
    expect(after.slice(0, KEYS.length)).toEqual(KEYS.map((key) => `[${key}]`));
    expect(after.at(-3)).toBe(DATA);
    expect(after.at(-2)).toBe(before.at(-2));
  });

  it('moves every message AND every formatter when the locale is the switch', () => {
    const { container } = screen();
    const before = texts(container);

    act(() => installLocaleOverride('fr'));

    const after = texts(container);
    expect(after.slice(0, KEYS.length)).toEqual(['Téléchargements', 'File', 'Ajouter']);
    expect(after.at(-3)).toBe(DATA);
    expect(after.at(-2)).not.toBe(before.at(-2));
  });

  it('gives the locale back when the switch does', () => {
    const { container } = screen();

    act(() => installLocaleOverride('fr'));
    act(() => installLocaleOverride(null));

    expect(texts(container).slice(0, KEYS.length)).toEqual(['Downloads', 'Queue', 'Add']);
  });

  it('keeps the screen it is switching over mounted, with everything it holds', () => {
    const { container } = screen();

    act(() => installLocaleOverride('fr'));
    act(() => installKeyInspector(asKey));

    expect(texts(container).at(-1)).toBe('mount 1');
  });
});
