// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DownloadQuery, DownloadView, PageView } from './schemas';
import { useDownloadsTable } from './use-downloads-table';

const PAGE: PageView = { page: 3, perPage: 10, total: 42, pageCount: 5 };

function download(id: string): DownloadView {
  return {
    id,
    clientId: 'embedded' as DownloadView['clientId'],
    clientName: 'Moteur',
    requestId: null,
    kind: 'movie',
    title: 'Dune',
    releaseTitle: `Rel.${id}.mkv`,
    season: null,
    episodes: null,
    status: 'downloading',
    progress: 0.5,
    downBps: 0,
    upBps: 0,
    peers: 0,
    peersSeen: 0,
    sizeBytes: null,
    score: null,
    error: null,
    grabbedAt: 1,
    completedAt: null,
    importedAt: null,
    indexerName: null,
    detailsUrl: null,
    infoHash: null,
    posterUrl: null,
    localId: null,
    year: null,
    tmdbId: null,
    matchSource: null,
    lifetimeDownloadedBytes: 0,
    lifetimeUploadedBytes: 0,
  };
}

function queue(query: DownloadQuery = {}, downloads: DownloadView[] = []) {
  const asked: DownloadQuery[] = [];
  const { result } = renderHook(() =>
    useDownloadsTable({
      downloads,
      page: PAGE,
      query,
      onQueryChange: (next) => asked.push(next),
    }),
  );
  return { asked, result };
}

describe('useDownloadsTable', () => {
  it('opens on the newest grab first, which is what the server does unasked', () => {
    const { result } = queue();

    const added = result.current.headings.find((heading) => heading.id === 'added');

    expect(added?.sorted).toBe('desc');
  });

  it('offers the ledger columns and refuses the two it cannot answer for', () => {
    const { result } = queue();

    const sortable = result.current.headings
      .filter((heading) => heading.onSortPress)
      .map((heading) => heading.id);

    expect(sortable).toEqual(['release', 'progress', 'status', 'added']);
  });

  it('names every heading with a key this module ships a translation for', () => {
    const { result } = queue();

    const labels = result.current.headings.map((heading) => heading.labelKey);

    expect(labels).toEqual([
      'downloads.colRelease',
      'downloads.colProgress',
      'downloads.colSpeed',
      'downloads.colStatus',
      'downloads.colAdded',
      undefined,
    ]);
  });

  it('reports the order the query holds as the one column the table is sorted by', () => {
    const { result } = queue({ sort: 'status', dir: 'asc' });

    expect(result.current.sort).toEqual([{ column: 'status', direction: 'asc' }]);
  });

  it('asks the server for the pressed column, ascending where that column reads better', () => {
    const { asked, result } = queue();

    result.current.onSortChange([], { column: 'release' });

    expect(asked).toEqual([{ sort: 'release', dir: 'asc', page: 1 }]);
  });

  it('turns a date column over on its first press rather than starting oldest', () => {
    const { asked, result } = queue({ sort: 'release', dir: 'asc' });

    result.current.onSortChange([], { column: 'added' });

    expect(asked).toEqual([{ sort: 'added', dir: 'desc', page: 1 }]);
  });

  it('identifies a row by the download it draws, not by where it sits on the page', () => {
    const { result } = queue({}, [download('d1'), download('d2')]);

    const ids = result.current.table.getRowModel().rows.map((row) => row.id);

    expect(ids).toEqual(['d1', 'd2']);
  });

  it('keeps the ordering rather than dropping it when its column is pressed twice', () => {
    const { asked, result } = queue({ sort: 'release', dir: 'desc' });

    result.current.onSortChange([], { column: 'release' });

    expect(asked).toEqual([{ sort: 'release', dir: 'asc', page: 1 }]);
  });
});
