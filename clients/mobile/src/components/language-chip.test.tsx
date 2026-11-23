// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#mobile/lib/i18n', () => ({
  useT: () => (key: string) => key,
}));

const { LanguageChip } = await import('./language-chip.component');

const LANGUAGES = [
  { code: 'en', count: 12 },
  { code: 'fr', count: 3 },
];

function chip(value: string | undefined) {
  const onValueChange = vi.fn();
  render(
    <LanguageChip
      stream="audio"
      languages={LANGUAGES}
      value={value}
      onValueChange={onValueChange}
    />,
  );
  return onValueChange;
}

afterEach(cleanup);

describe('a catalogue language filter', () => {
  it('names the filter until a language is picked, then the language', () => {
    chip(undefined);
    const unpicked = screen.queryByText('browse.audioLanguage');
    cleanup();

    chip('fr');

    expect(unpicked).toBeTruthy();
    expect(screen.queryByText('browse.audioLanguage')).toBeNull();
    expect(screen.getByText('lang.fr')).toBeTruthy();
  });

  it('opens every language with how many titles have it, and hands back the one tapped', async () => {
    const onValueChange = chip(undefined);

    fireEvent.click(screen.getByText('browse.audioLanguage'));
    const english = await screen.findByText('lang.en');
    const counts = [screen.queryByText('12'), screen.queryByText('3')];
    fireEvent.click(english);

    expect(counts.every(Boolean)).toBe(true);
    expect(onValueChange).toHaveBeenCalledWith('en');
  });

  it('clears the pick from Any language', async () => {
    const onValueChange = chip('fr');

    fireEvent.click(screen.getByText('lang.fr'));
    fireEvent.click(await screen.findByText('browse.anyLanguage'));

    expect(onValueChange).toHaveBeenCalledWith(undefined);
  });
});
