// @vitest-environment jsdom

import type { GenreCount } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowseFilters } from '#tv/features/catalog/TvBrowseHeader';

afterEach(cleanup);

const GENRES: GenreCount[] = [
  { slug: 'horror', name: 'Horror', count: 144 },
  { slug: 'comedy', name: 'Comedy', count: 12 },
];

function filters(genre: string | undefined) {
  const onGenre = vi.fn();
  const view = render(
    <I18nProvider locale="en">
      <BrowseFilters
        sort="added"
        onSort={() => {}}
        genres={GENRES}
        genre={genre}
        onGenre={onGenre}
      />
    </I18nProvider>,
  );
  return { onGenre, container: view.container };
}

describe('the browse filters', () => {
  it('says how many titles a genre holds, so an empty one is visible before you enter it', () => {
    filters(undefined);
    expect(screen.getByText('144')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('picks a genre', () => {
    const { onGenre } = filters(undefined);
    fireEvent.click(screen.getByText('Horror'));
    expect(onGenre).toHaveBeenCalledWith('horror');
  });

  it('clears the one it is already in, rather than sending you back to All', () => {
    const { onGenre } = filters('horror');
    fireEvent.click(screen.getByText('Horror'));
    expect(onGenre).toHaveBeenCalledWith(undefined);
  });
});
