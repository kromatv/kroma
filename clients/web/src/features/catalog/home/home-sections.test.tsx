// @vitest-environment jsdom

import { CardSection } from '@kromatv/client/media';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HomeSection } from '#web/features/catalog/home/entries';

vi.mock('#web/features/catalog/home/ranked-rail.component', () => ({
  RankedRail: () => <p>ranked</p>,
}));
vi.mock('#web/features/catalog/home/wide-rail.component', () => ({ WideRail: () => <p>wide</p> }));
vi.mock('#web/features/catalog/home/spotlight.component', () => ({
  Spotlight: () => <p>spotlight</p>,
}));
vi.mock('#web/features/catalog/cards.component', () => ({ SectionPoster: () => <p>poster</p> }));
vi.mock('#web/shared/ui', () => ({
  PosterRail: () => <p>posters</p>,
  RailSkeleton: () => <p>pending</p>,
}));

import { HomeSectionView } from '#web/features/catalog/home/home-sections.component';

const entry = {
  type: 'show',
  show: {
    id: 's1',
    title: 'Dark',
    year: null,
    library: 'l1',
    video: null,
    addedAt: '2026-01-01T00:00:00Z',
    seasonCount: 1,
    episodeCount: 1,
  },
};

function section(layout: string, extra: Partial<HomeSection> = {}): HomeSection {
  return CardSection.parse({
    id: 'row',
    title: 'A row',
    layout,
    notes: {},
    items: [entry],
    ...extra,
  });
}

afterEach(cleanup);

it.each([
  ['rail', 'posters'],
  ['wide', 'wide'],
  ['ranked', 'ranked'],
])('draws a %s section as %s under its title', (layout, drawn) => {
  render(<HomeSectionView section={section(layout)} />);

  expect(screen.getByText(drawn)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'A row' })).toBeTruthy();
});

it('gives a spotlight the whole band, with no row title above it', () => {
  render(<HomeSectionView section={section('spotlight')} />);

  expect(screen.getByText('spotlight')).toBeTruthy();
  expect(screen.queryByRole('heading')).toBeNull();
});

it('leaves the hero to the page, which draws it above the viewer own rows', () => {
  const { container } = render(<HomeSectionView section={section('hero')} />);

  expect(container.textContent).toBe('');
});

it('draws nothing for a section the server sent empty', () => {
  const { container } = render(<HomeSectionView section={section('rail', { items: [] })} />);

  expect(container.textContent).toBe('');
});

it('says why a row is there when the server gives a reason', () => {
  render(<HomeSectionView section={section('rail', { reason: 'Because you watched Dune' })} />);

  expect(screen.getByText('Because you watched Dune')).toBeTruthy();
});
