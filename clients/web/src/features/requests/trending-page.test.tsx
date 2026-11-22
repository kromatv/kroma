// @vitest-environment jsdom
import type { DiscoverEntry, TmdbKind } from '@kromatv/client/discovery';
import { I18nProvider } from '@kromatv/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrendingPageState } from './use-discover-search.hook';

let listing: TrendingPageState = { loading: false, entries: [], totalPages: 1 };
let permissions: string[] = [];
const asked = vi.fn();

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: { permissions } }) }));
vi.mock('#web/features/requests/use-discover-search.hook', () => ({
  useTrendingPage: (kind: TmdbKind, page: number) => {
    asked(kind, page);
    return listing;
  },
}));
vi.mock('#web/features/requests/discover-card.component', () => ({
  DiscoverCard: ({ entry }: { entry: DiscoverEntry }) => <p>{entry.title}</p>,
}));
vi.mock('#web/shared/ui/tile-grid.component', () => ({
  TileGrid: ({ children }: { children: (width: number) => ReactNode }) => (
    <div>{children(160)}</div>
  ),
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children }: { children: ReactNode }) => <a href="/search">{children}</a>,
}));

const { TrendingPage } = await import('./trending-page.component');

function film(tmdbId: number): DiscoverEntry {
  return {
    kind: 'movie',
    tmdbId,
    title: `Film ${tmdbId}`,
    year: 2026,
    posterUrl: null,
    backdropUrl: null,
    overview: null,
    rating: null,
    inLibrary: false,
    localId: null,
    requestId: null,
    requestStatus: null,
    requestProgress: null,
  };
}

function open(kind: TmdbKind = 'movie', page = 1) {
  const onKindChange = vi.fn();
  const onPageChange = vi.fn();
  render(
    <I18nProvider locale="en">
      <TrendingPage
        kind={kind}
        page={page}
        onKindChange={onKindChange}
        onPageChange={onPageChange}
      />
    </I18nProvider>,
  );
  return { onKindChange, onPageChange };
}

beforeEach(() => {
  listing = { loading: false, entries: [film(1), film(2)], totalPages: 8 };
  permissions = ['requests.create'];
  asked.mockReset();
});

afterEach(cleanup);

describe('the trending page', () => {
  it('lists the titles of the page it shows', () => {
    open();

    expect(screen.getByText('Film 1')).toBeTruthy();
    expect(screen.getByText('Film 2')).toBeTruthy();
  });

  it('asks for the kind and the page it shows', () => {
    open('tv', 3);

    expect(asked).toHaveBeenCalledWith('tv', 3);
    expect(screen.getByText('Trending shows')).toBeTruthy();
  });

  it('goes to the page pressed', () => {
    const { onPageChange } = open();

    fireEvent.click(screen.getByLabelText('Page 2 / 8'));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('draws no pager when the list fits on one page', () => {
    listing = { ...listing, totalPages: 1 };

    open();

    expect(screen.queryByLabelText('Page 1 / 1')).toBeNull();
  });

  it('switches to the shows', () => {
    const { onKindChange } = open();

    fireEvent.click(screen.getByRole('radio', { name: 'Shows' }));

    expect(onKindChange).toHaveBeenCalledWith('tv');
  });

  it('keeps its pager while the next page loads', () => {
    listing = { loading: true, entries: [], totalPages: 8 };

    open();

    expect(screen.queryByText('No results.')).toBeNull();
    expect(screen.getByLabelText('Page 2 / 8')).toBeTruthy();
  });

  it('says so when the page holds nothing', () => {
    listing = { loading: false, entries: [], totalPages: 1 };

    open();

    expect(screen.getByText('No results.')).toBeTruthy();
  });

  it('offers nothing to browse to a viewer who may not request', () => {
    permissions = [];

    open();

    expect(screen.getByText('Start typing to search.')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Shows' })).toBeNull();
    expect(asked).not.toHaveBeenCalled();
  });
});
