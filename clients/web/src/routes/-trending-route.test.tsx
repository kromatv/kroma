// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { TrendingPage } from '#web/features/requests/trending-page.component';
import { openTrendingFilms } from '#web/features/requests/trending-url';

type PageProps = ComponentProps<typeof TrendingPage>;

const shown = vi.fn<(props: PageProps) => void>();
const navigate = vi.fn();

vi.mock('#web/features/requests/trending-page.component', () => ({
  TrendingPage: (props: PageProps) => {
    shown(props);
    return null;
  },
}));

const { Route } = await import('./_app.trending.$type');
const { Route: Bare } = await import('./_app.trending.index');

function open(type: string, search: { page?: number }): PageProps {
  vi.spyOn(Route, 'useParams').mockReturnValue({ type });
  vi.spyOn(Route, 'useSearch').mockReturnValue(search);
  vi.spyOn(Route, 'useNavigate').mockReturnValue(navigate);
  const Page = Route.options.component;
  if (!Page) {
    throw new Error('the trending route draws a page');
  }
  render(<Page />);
  const props = shown.mock.lastCall?.[0];
  if (!props) {
    throw new Error('the trending route drew no page');
  }
  return props;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  shown.mockReset();
  navigate.mockReset();
});

it('shows the kind and the page the url names', () => {
  const props = open('tv', { page: 3 });

  expect([props.kind, props.page]).toEqual(['tv', 3]);
});

it('reads a url without a page as the first page', () => {
  const props = open('movie', {});

  expect(props.page).toBe(1);
});

it('writes a later page into the url and the first page out of it', () => {
  const props = open('movie', { page: 3 });

  props.onPageChange(4);
  props.onPageChange(1);

  expect(navigate.mock.calls).toEqual([[{ search: { page: 4 } }], [{ search: {} }]]);
});

it('opens the other kind on its first page', () => {
  const props = open('movie', { page: 3 });

  props.onKindChange('tv');

  expect(navigate).toHaveBeenCalledWith({
    to: '/trending/$type',
    params: { type: 'tv' },
    search: {},
  });
});

it('sends the bare trending url to the films', () => {
  expect(Bare.options.beforeLoad).toBe(openTrendingFilms);
});
