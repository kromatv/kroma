// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useLanguageFilters } from '#tv/features/catalog/use-language-filters.hook';

afterEach(cleanup);

const FILMS = [
  { audioLanguages: ['eng', 'fre'], subtitleLanguages: [] },
  { audioLanguages: ['fra'], subtitleLanguages: [] },
];

function filters(items = FILMS, section = 'films') {
  return renderHook(({ list, name }) => useLanguageFilters(list, name), {
    initialProps: { list: items, name: section },
  });
}

describe('useLanguageFilters', () => {
  it('offers a chip only for a stream the titles name a language on', () => {
    const { result } = filters();

    expect(result.current.chips.map((chip) => chip.stream)).toEqual(['audio']);
    expect(result.current.chips[0]?.languages).toEqual([
      { code: 'fr', count: 2 },
      { code: 'en', count: 1 },
    ]);
    expect(result.current.filter).toEqual({ audio: undefined, subtitles: undefined });
  });

  it('narrows the filter to the language a chip picks', () => {
    const { result } = filters();

    act(() => result.current.chips[0]?.onValueChange('fr'));

    expect(result.current.filter.audio).toBe('fr');
    expect(result.current.chips[0]?.value).toBe('fr');
  });

  it('keeps every title until a pick, then only the titles it matches', () => {
    const { result } = filters();
    const before = result.current.narrow(FILMS);

    act(() => result.current.chips[0]?.onValueChange('en'));

    expect(before).toEqual(FILMS);
    expect(result.current.narrow(FILMS)).toEqual([FILMS[0]]);
  });

  it('forgets the picks when the section changes', () => {
    const { result, rerender } = filters();
    act(() => result.current.chips[0]?.onValueChange('fr'));

    rerender({ list: FILMS, name: 'series' });

    expect(result.current.filter.audio).toBeUndefined();
  });
});
