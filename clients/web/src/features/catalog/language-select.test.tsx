// @vitest-environment jsdom

import type { LanguageCount } from '@kromatv/core';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageSelect } from './language-select.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const LANGUAGES: LanguageCount[] = [
  { code: 'fr', count: 12 },
  { code: 'ja', count: 3 },
];

function select(languages: LanguageCount[], value?: string) {
  const onValueChange = vi.fn();
  const view = render(
    <I18nProvider locale="en">
      <LanguageSelect
        stream="subtitles"
        languages={languages}
        value={value}
        onValueChange={onValueChange}
      />
    </I18nProvider>,
  );
  return { onValueChange, container: view.container };
}

function open() {
  fireEvent.click(screen.getByRole('combobox'));
  clearPressGuard();
}

describe('LanguageSelect', () => {
  it('draws nothing when no title names a language', () => {
    const { container } = select([]);

    expect(container.textContent).toBe('');
  });

  it('lists each language with how many titles have it, and picks one', () => {
    const { onValueChange } = select(LANGUAGES);

    open();
    const counts = ['12', '3'].map((count) => screen.queryByText(count) !== null);
    fireEvent.click(screen.getByRole('option', { name: /Japanese/ }));

    expect(counts).toEqual([true, true]);
    expect(onValueChange).toHaveBeenCalledWith('ja');
  });

  it('clears the pick from Any language', () => {
    const { onValueChange } = select(LANGUAGES, 'fr');

    open();
    fireEvent.click(screen.getByRole('option', { name: /Any language/ }));

    expect(onValueChange).toHaveBeenCalledWith(undefined);
  });
});
