import { ItemId, type PlayEntry, ShowId } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import {
  HISTORY_COLUMNS,
  ITEM_HISTORY_COLUMNS,
  isHistorySort,
  kindKey,
  titleLines,
  titlePage,
} from './history-columns';

const play = (fields: Partial<PlayEntry>): PlayEntry => ({
  id: 'p1',
  username: 'max',
  inCatalog: true,
  kind: 'movie',
  title: 'Arrival',
  startedAt: 0,
  endedAt: 0,
  watchedMs: 0,
  ...fields,
});

describe("the watch history's columns", () => {
  it('reads the account, the kind, the title, the player, the platform and when', () => {
    expect(HISTORY_COLUMNS.map((column) => column.column)).toEqual([
      'username',
      'kind',
      'title',
      'player',
      'device',
      'endedAt',
    ]);
  });

  it('drops the title from one title of its own', () => {
    expect(ITEM_HISTORY_COLUMNS.map((column) => column.column)).not.toContain('title');
  });

  it('keeps when it was watched on a narrow screen once the title is gone', () => {
    const when = ITEM_HISTORY_COLUMNS.find((column) => column.column === 'endedAt');

    expect(when?.from).toBe('base');
  });

  it('orders by a column the table has and by nothing else', () => {
    expect(isHistorySort('endedAt')).toBe(true);
    expect(isHistorySort('watchedMs')).toBe(false);
  });
});

describe("a row's title", () => {
  it('is the film on one line', () => {
    expect(titleLines(play({ title: 'Arrival' }))).toEqual({ lead: 'Arrival', detail: null });
  });

  it('names the series, the season, the episode number and the episode', () => {
    const episode = play({
      title: 'Chikhai Bardo',
      showTitle: 'Severance',
      season: 2,
      episode: 7,
    });

    expect(titleLines(episode)).toEqual({
      lead: 'Severance',
      detail: 'S2E7 · Chikhai Bardo',
    });
  });

  it('still names the series when the log kept no season number', () => {
    const episode = play({ title: 'Pilot', showTitle: 'Severance' });

    expect(titleLines(episode)).toEqual({ lead: 'Severance', detail: 'Pilot' });
  });
});

describe('the page a row opens', () => {
  it('is the series an episode belongs to, rather than the episode', () => {
    const episode = play({
      kind: 'episode',
      itemId: ItemId.parse('ep7'),
      showId: ShowId.parse('sev'),
    });

    expect(titlePage(episode)).toEqual({ page: 'show', id: 'sev' });
  });

  it('is the film itself', () => {
    expect(titlePage(play({ kind: 'movie', itemId: ItemId.parse('arrival') }))).toEqual({
      page: 'movie',
      id: 'arrival',
    });
  });

  it('is nowhere once the title has left the catalog', () => {
    const gone = play({ kind: 'movie', itemId: ItemId.parse('arrival'), inCatalog: false });

    expect(titlePage(gone)).toBeNull();
  });

  it('is nowhere for an episode the log kept no series for', () => {
    expect(titlePage(play({ kind: 'episode', itemId: ItemId.parse('ep7') }))).toBeNull();
  });
});

describe("a row's kind", () => {
  it('separates a film from everything the log files as television', () => {
    expect([kindKey('movie'), kindKey('tv')]).toEqual(['admin.kindMovie', 'admin.kindTv']);
  });
});
