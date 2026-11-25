// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FormFactor, KitProvider } from '#ui/configure';
import { I18nProvider } from '#ui/services/i18n';
import { createInputTestHost } from '#ui/testing-input';
import { LanguagePicker, type LanguagePickerRootProps } from './language-picker.component';
import { DEVICE, SHORT, WORLD } from './language-picker.fixtures';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function on(formFactor: FormFactor) {
  return function Kit({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <KitProvider config={{ formFactor }}>
        <I18nProvider locale="en">{children}</I18nProvider>
      </KitProvider>
    );
  };
}

type Props = Partial<LanguagePickerRootProps<string>>;

function open(props: Props = {}, formFactor: FormFactor = 'browser') {
  render(
    <LanguagePicker.Root
      locales={WORLD}
      label="Interface language"
      defaultValue="fr"
      preferred={DEVICE}
      {...props}
    >
      <LanguagePicker.Trigger />
    </LanguagePicker.Root>,
    { wrapper: on(formFactor) },
  );
  fireEvent.click(screen.getByRole('button', { name: /^Interface language/ }));
  clearPressGuard();
}

const rows = () => screen.getAllByRole('radio').map((row) => row.getAttribute('aria-label'));

const search = (typed: string) =>
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: typed } });

describe('the trigger of a <LanguagePicker>', () => {
  it('names the language picked in its own words', () => {
    render(
      <LanguagePicker.Root locales={WORLD} label="Interface language" defaultValue="ja">
        <LanguagePicker.Trigger />
      </LanguagePicker.Root>,
      { wrapper: on('browser') },
    );

    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Interface language: 日本語',
    );
  });

  it('opens the list on a press', () => {
    open();

    expect(screen.getAllByRole('radio')).toHaveLength(WORLD.length);
  });
});

describe('the order of a long list', () => {
  it('leads with the language picked, then the ones the device asks for', () => {
    open();

    expect(rows().slice(0, 3)).toEqual(['Français, French', '日本語, Japanese', 'English']);
  });

  it('sorts the others by the name the reader knows them by', () => {
    open();

    expect(rows().slice(3, 6)).toEqual([
      'العربية, Arabic',
      'Nederlands, Dutch',
      'Français (Canada), French (Canada)',
    ]);
  });

  it('heads the two runs', () => {
    open();

    expect(screen.getByText('Suggested')).toBeTruthy();
    expect(screen.getByText('All languages')).toBeTruthy();
  });
});

describe('the search of a long list', () => {
  it('finds a language by its own name whatever the accents and the case', () => {
    open();

    search('ESPANOL');

    expect(rows()).toEqual(['Español, Spanish']);
  });

  it('finds a language by its name in the language on screen', () => {
    open();

    search('japan');

    expect(rows()).toEqual(['日本語, Japanese']);
  });

  it('finds a language by its code', () => {
    open();

    search('PT');

    expect(rows()).toEqual(['Português, Portuguese']);
  });

  it('says so when it finds nothing', () => {
    open();

    search('klingon');

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('No language matches. English is always there.')).toBeTruthy();
  });

  it('is not offered on a television, which has no keyboard', () => {
    open({}, 'tv');

    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(WORLD.length);
  });
});

describe('a short list', () => {
  it('is one run with no search', () => {
    open({ locales: SHORT, defaultValue: 'en' });

    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByText('Suggested')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(SHORT.length);
  });
});

describe('a row', () => {
  it('writes the language in that language', () => {
    open();

    expect(screen.getByText('日本語').getAttribute('lang')).toBe('ja');
  });

  it('tags a language still in beta', () => {
    open({ locales: SHORT, defaultValue: 'en' });

    const korean = screen.getByRole('radio', { name: '한국어, Korean' });

    expect(korean.textContent).toContain('Beta');
  });

  it('is checked for the language picked', () => {
    open();

    expect(
      screen.getByRole('radio', { name: 'Français, French' }).getAttribute('aria-checked'),
    ).toBe('true');
  });
});

describe('a pick', () => {
  it('hands the app the code and why', () => {
    const onValueChange = vi.fn();
    open({ onValueChange });

    fireEvent.click(screen.getByRole('radio', { name: 'Deutsch, German' }));

    expect(onValueChange).toHaveBeenCalledWith('de', expect.objectContaining({ reason: 'select' }));
  });

  it('closes the list', () => {
    open();

    fireEvent.click(screen.getByRole('radio', { name: 'Deutsch, German' }));

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Interface language: Deutsch',
    );
  });

  it('closes the list when the language picked is picked again', () => {
    open();

    fireEvent.click(screen.getByRole('radio', { name: 'Français, French' }));

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});
