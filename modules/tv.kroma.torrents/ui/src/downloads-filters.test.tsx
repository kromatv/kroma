// @vitest-environment jsdom

import { AdminHostProvider, ModuleScope } from '@kroma/module-sdk';
import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DownloadFilters } from './downloads-filters';
import type { DownloadQuery, DownloadStatsView } from './schemas';

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const STATS: DownloadStatsView = {
  downBps: 0,
  upBps: 0,
  peers: 0,
  active: 0,
  byStatus: { downloading: 2, completed: 7 },
  totalDownloadedBytes: 0,
  totalUploadedBytes: 0,
  history: [],
};

function bar(query: DownloadQuery): DownloadQuery[] {
  const asked: DownloadQuery[] = [];
  render(
    onScreen(
      <AdminHostProvider value={{ client: {}, user: null, apiBase: '' } as never}>
        <ModuleScope id="tv.kroma.torrents">
          <DownloadFilters
            query={query}
            onQueryChange={(next) => asked.push(next)}
            stats={STATS}
            clients={[]}
            search=""
            onSearchChange={() => undefined}
          />
        </ModuleScope>
      </AdminHostProvider>,
    ),
  );
  clearPressGuard();
  return asked;
}

function openStatus(): void {
  fireEvent.click(screen.getAllByRole('combobox')[0] as HTMLElement);
  clearPressGuard();
}

describe('the downloads filter bar', () => {
  it('asks for a status beside the ones already asked for', () => {
    const asked = bar({ page: 3, status: 'active' });

    openStatus();
    fireEvent.click(screen.getAllByRole('option')[2] as HTMLElement);

    expect(asked).toEqual([{ page: 1, status: 'active,done' }]);
  });

  it('drops the whole filter when the row for everything is picked', () => {
    const asked = bar({ page: 1, status: 'active,done' });

    openStatus();
    fireEvent.click(screen.getAllByRole('option')[0] as HTMLElement);

    expect(asked).toEqual([{ page: 1, status: undefined }]);
  });
});
