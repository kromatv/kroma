// @vitest-environment jsdom

import type { LanguageCount } from '@kromatv/core';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageChip } from '#tv/features/catalog/language-chip.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const LANGUAGES: LanguageCount[] = [
  { code: 'fr', count: 12 },
  { code: 'ja', count: 3 },
];

function chip(value: string | undefined) {
  const onValueChange = vi.fn();
  render(
    <I18nProvider locale="en">
      <LanguageChip
        stream="audio"
        languages={LANGUAGES}
        value={value}
        onValueChange={onValueChange}
      />
    </I18nProvider>,
  );
  return onValueChange;
}

function open(name: string) {
  fireEvent.click(screen.getByText(name));
  clearPressGuard();
}

describe('the language chip', () => {
  it('names the stream while nothing is picked', () => {
    chip(undefined);

    expect(screen.getByText('Audio language')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names the language once one is picked', () => {
    chip('fr');

    expect(screen.getByText('French')).toBeTruthy();
  });

  it('opens the languages the section has, each with how many titles have it', () => {
    chip(undefined);

    open('Audio language');

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('option', { name: /Japanese/ })).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('picks a language', () => {
    const onValueChange = chip(undefined);

    open('Audio language');
    fireEvent.click(screen.getByRole('option', { name: /Japanese/ }));

    expect(onValueChange).toHaveBeenCalledWith('ja');
  });

  it('clears the pick from Any language', () => {
    const onValueChange = chip('fr');

    open('French');
    fireEvent.click(screen.getByRole('option', { name: /Any language/ }));

    expect(onValueChange).toHaveBeenCalledWith(undefined);
  });
});
