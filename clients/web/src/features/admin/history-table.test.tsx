// @vitest-environment jsdom

import type { PlayEntry } from '@kromatv/client/admin';
import { ItemId, ShowId } from '@kromatv/client/media';
import { I18nProvider } from '@kromatv/ui';
import { createStyleTestHost } from '@kromatv/ui/testing';

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_COLUMNS } from '#web/features/admin/history-columns';
import { historySort } from '#web/features/admin/history-query';
import { HistoryTable } from '#web/features/admin/history-table.component';

const styleHost = createStyleTestHost();

const play = (fields: Partial<PlayEntry>): PlayEntry => ({
  id: 'p1',
  username: 'maxime',
  inCatalog: true,
  kind: 'movie',
  title: 'Les Affranchis',
  startedAt: 0,
  endedAt: 1_700_000_000,
  watchedMs: 0,
  ...fields,
});

afterEach(() => {
  cleanup();
  styleHost.pinDesignWidth();
});

async function mount(plays: readonly PlayEntry[], onSortChange = vi.fn()) {
  styleHost.pinDesignWidth(1200);
  const root = createRootRoute({
    component: () => (
      <I18nProvider locale="en">
        <HistoryTable
          columns={HISTORY_COLUMNS}
          plays={plays}
          sort={historySort({})}
          onSortChange={onSortChange}
          emptyKey="admin.noHistory"
          loaded
        />
      </I18nProvider>
    ),
  });
  const show = createRoute({ getParentRoute: () => root, path: '/shows/$id' });
  const movie = createRoute({ getParentRoute: () => root, path: '/movies/$id' });
  const router = createRouter({
    routeTree: root.addChildren([show, movie]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  styleHost.render(<RouterProvider router={router} />);
  return onSortChange;
}

const firstRow = () => screen.getAllByRole('row')[1] as HTMLElement;

describe('the watch history table', () => {
  it('draws one row per session the log answered with', async () => {
    await mount([play({ id: 'p1' }), play({ id: 'p2' }), play({ id: 'p3' })]);

    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getAllByText('Les Affranchis')).toHaveLength(3);
  });

  it('names the series, the season and the episode in the title of one row', async () => {
    await mount([play({ title: 'Chikhai Bardo', showTitle: 'Severance', season: 2, episode: 7 })]);

    expect(screen.getByText('Severance')).toBeTruthy();
    expect(screen.getByText('S2E7 · Chikhai Bardo')).toBeTruthy();
  });

  it('reads the player under the player and the device it ran on under the platform', async () => {
    await mount([play({ player: 'Chrome', device: 'macOS' })]);

    const cells = within(firstRow()).getAllByRole('cell');

    expect(cells.map((cell) => cell.textContent)).toEqual([
      'maxime',
      'Films',
      'Les Affranchis',
      'Chrome',
      'macOS',
      expect.any(String),
      expect.any(String),
    ]);
  });

  it('says which column is ordering the rows and which way', async () => {
    await mount([play({})]);

    const when = screen.getAllByRole('columnheader')[5] as HTMLElement;

    expect(when.getAttribute('aria-sort')).toBe('descending');
  });

  it('turns the column already ordering it around rather than unordering the rows', async () => {
    const asked = await mount([play({})]);

    fireEvent.click(screen.getByRole('button', { name: /^When/ }));

    expect(asked).toHaveBeenCalledWith([{ column: 'endedAt', direction: 'asc' }], {
      column: 'endedAt',
    });
  });

  it('says the log holds nothing rather than drawing a table with no rows in it', async () => {
    await mount([]);

    expect(screen.getByText('No playback history yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('opens a film on its own page', async () => {
    await mount([play({ itemId: ItemId.parse('goodfellas'), kind: 'movie' })]);

    expect(firstRow().getAttribute('href')).toBe('/movies/goodfellas');
  });

  it('opens the series an episode belongs to, which is the page that exists', async () => {
    await mount([
      play({
        itemId: ItemId.parse('ep7'),
        showId: ShowId.parse('sev'),
        kind: 'episode',
        title: 'Chikhai Bardo',
        showTitle: 'Severance',
      }),
    ]);

    expect(firstRow().getAttribute('href')).toBe('/shows/sev');
  });

  it('makes the whole row the link rather than the title written inside it', async () => {
    await mount([play({ itemId: ItemId.parse('goodfellas'), kind: 'movie' })]);

    expect(firstRow().tagName).toBe('A');
    expect(within(firstRow()).queryByRole('link')).toBeNull();
  });

  it('leaves a row whose title has left the catalog with nowhere to send the reader', async () => {
    await mount([
      play({
        itemId: ItemId.parse('gone'),
        kind: 'episode',
        inCatalog: false,
        title: 'The Dundies',
        showTitle: 'The Office',
      }),
    ]);

    expect(firstRow().getAttribute('href')).toBeNull();
    expect(screen.getByText('The Office')).toBeTruthy();
  });

  it('writes the date and the time of day rather than how long ago it was', async () => {
    await mount([play({})]);

    const when = within(firstRow()).getAllByRole('cell')[5]?.textContent ?? '';

    expect(when).toContain('2023');
    expect(when).not.toMatch(/ago/);
  });
});

const HOME_NAS = { importer: 'tv.kroma.jellyfin', name: 'Home NAS' };
const ONE_HOUR_FIFTY_TWO = 6_720_000;

const cellsOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('the time a play lasted', () => {
  it('is written in hours and minutes', async () => {
    await mount([play({ watchedMs: 3_000_000 })]);

    expect(cellsOf(firstRow())[6]).toBe('50 min');
  });
});

describe('a play an import brought', () => {
  it('says so beside the person who watched', async () => {
    await mount([play({ importedFrom: HOME_NAS })]);

    expect(cellsOf(firstRow())[0]).toBe('maximeImported');
  });

  it('names the server it came from where the player goes', async () => {
    await mount([play({ importedFrom: HOME_NAS })]);

    expect(cellsOf(firstRow())[3]).toBe('From Home NAS');
  });

  it('says another server when that server gave no name', async () => {
    await mount([play({ importedFrom: { importer: '', name: '' } })]);

    expect(cellsOf(firstRow())[3]).toBe('From another server');
  });

  it('reads unknown for the platform the other server did not record', async () => {
    await mount([play({ importedFrom: HOME_NAS }), play({ id: 'p2' })]);

    const [imported, ours] = screen.getAllByRole('row').slice(1).map(cellsOf);

    expect(imported?.[4]).toBe('Unknown');
    expect(ours?.[4]).toBe('-');
  });

  it("says its time is the title's runtime when the other server kept no duration", async () => {
    await mount([
      play({ importedFrom: HOME_NAS, watchedMs: ONE_HOUR_FIFTY_TWO, watchedIsRuntime: true }),
    ]);

    expect(cellsOf(firstRow())[6]).toBe('1 h 52 minRuntime');
  });

  it('reads unknown, not zero, when the catalog holds no runtime either', async () => {
    await mount([play({ importedFrom: HOME_NAS, watchedMs: 0, watchedIsRuntime: true })]);

    expect(cellsOf(firstRow())[6]).toBe('Unknown');
  });
});
