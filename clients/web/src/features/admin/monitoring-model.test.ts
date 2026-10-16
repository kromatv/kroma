import { WantedId } from '@kromatv/client/requests';
import { describe, expect, it } from 'vitest';
import {
  airStatusKey,
  episodeState,
  filterMonitored,
  type MonitoredRow,
  monitorCandidates,
} from './monitoring-model';

const EVERY = { kind: 'all', onlyMissing: false, needle: '' } as const;

function row(over: Partial<MonitoredRow> = {}): MonitoredRow {
  return { kind: 'show', title: 'Severance', missing: 0, ...over };
}

function episode(over: Partial<Parameters<typeof episodeState>[0]> = {}) {
  return {
    onDisk: false,
    wantedId: WantedId.parse('w_1'),
    wantedStatus: 'wanted',
    airDate: null,
    ...over,
  };
}

function catalogTitle(tmdbId: number | null, title: string, year: number | null = 2011) {
  return {
    title,
    year,
    metadata: tmdbId == null ? null : { tmdbId, posterUrl: `/api/images/${tmdbId}` },
  };
}

describe('episodeState', () => {
  it('reads an episode on disk as available whatever its row says', () => {
    expect(episodeState(episode({ onDisk: true, wantedStatus: 'wanted' }), '2026-10-16')).toBe(
      'available',
    );
  });

  it('reads an episode nothing monitors as untracked', () => {
    expect(episodeState(episode({ wantedId: null, wantedStatus: null }), '2026-10-16')).toBe(
      'untracked',
    );
  });

  it('reads a grabbed episode as on its way rather than missing', () => {
    const grabbed = episode({ wantedStatus: 'grabbed', airDate: '2020-01-01' });

    expect(episodeState(grabbed, '2026-10-16')).toBe('grabbed');
  });

  it('reads an episode that airs after today as upcoming', () => {
    expect(episodeState(episode({ airDate: '2026-10-17' }), '2026-10-16')).toBe('upcoming');
  });

  it('reads an episode airing today as missing, since the search gate opens on it', () => {
    expect(episodeState(episode({ airDate: '2026-10-16' }), '2026-10-16')).toBe('missing');
  });

  it('reads a monitored episode with no air date at all as missing', () => {
    expect(episodeState(episode({ airDate: null }), '2026-10-16')).toBe('missing');
  });

  it('keeps an available row available even with nothing on disk yet', () => {
    expect(episodeState(episode({ wantedStatus: 'available' }), '2026-10-16')).toBe('available');
  });
});

describe('filterMonitored', () => {
  it('sorts by title rather than by the order the server sent', () => {
    const rows = filterMonitored(
      [row({ title: 'Zoulou' }), row({ title: 'Alpha' }), row({ title: 'Milieu' })],
      EVERY,
    );

    expect(rows.map((r) => r.title)).toEqual(['Alpha', 'Milieu', 'Zoulou']);
  });

  it('keeps only the kind the filter names', () => {
    const rows = [row({ kind: 'movie', title: 'Dune' }), row({ title: 'Severance' })];

    expect(filterMonitored(rows, { ...EVERY, kind: 'movie' }).map((r) => r.title)).toEqual([
      'Dune',
    ]);
    expect(filterMonitored(rows, { ...EVERY, kind: 'show' }).map((r) => r.title)).toEqual([
      'Severance',
    ]);
  });

  it('keeps only the titles with a gap when asked for them', () => {
    const rows = [row({ title: 'Complet' }), row({ title: 'Troué', missing: 3 })];

    expect(filterMonitored(rows, { ...EVERY, onlyMissing: true }).map((r) => r.title)).toEqual([
      'Troué',
    ]);
  });

  it('matches the text filter inside the title, ignoring case and spacing', () => {
    const rows = [row({ title: 'Le Trône de fer' }), row({ title: 'Severance' })];

    expect(filterMonitored(rows, { ...EVERY, needle: '  TRÔNE ' }).map((r) => r.title)).toEqual([
      'Le Trône de fer',
    ]);
  });

  it('answers an empty list with no rows', () => {
    expect(filterMonitored([], EVERY)).toEqual([]);
  });
});

describe('monitorCandidates', () => {
  it('offers a library title TMDB knows and nothing monitors yet', () => {
    const candidates = monitorCandidates(
      [catalogTitle(438631, 'Dune')],
      [catalogTitle(95396, 'Severance')],
      [],
    );

    expect(candidates).toEqual([
      { kind: 'movie', tmdbId: 438631, title: 'Dune', year: 2011, posterUrl: '/api/images/438631' },
      {
        kind: 'show',
        tmdbId: 95396,
        title: 'Severance',
        year: 2011,
        posterUrl: '/api/images/95396',
      },
    ]);
  });

  it('drops a title no provider matched, since monitoring is keyed on a tmdb id', () => {
    expect(monitorCandidates([catalogTitle(null, 'Home video')], [], [])).toEqual([]);
  });

  it('drops a title that is already monitored, kind by kind', () => {
    const candidates = monitorCandidates(
      [catalogTitle(7, 'Film')],
      [catalogTitle(7, 'Série')],
      [{ kind: 'movie', tmdbId: 7 }],
    );

    expect(candidates.map((c) => c.kind)).toEqual(['show']);
  });

  it('offers a title held by several files once', () => {
    const candidates = monitorCandidates(
      [catalogTitle(438631, 'Dune'), catalogTitle(438631, 'Dune')],
      [],
      [],
    );

    expect(candidates).toHaveLength(1);
  });

  it('sorts by title and puts the kind in the key, so a movie and a show can share an id', () => {
    const candidates = monitorCandidates(
      [catalogTitle(7, 'Zoulou')],
      [catalogTitle(7, 'Alpha')],
      [],
    );

    expect(candidates.map((c) => c.title)).toEqual(['Alpha', 'Zoulou']);
  });
});

describe('airStatusKey', () => {
  it('names the status TMDB reports for a show still running', () => {
    expect(airStatusKey('Returning Series')).toBe('monitoring.airReturning');
  });

  it('leaves a status it does not know untranslated rather than guessing', () => {
    expect(airStatusKey('Pilot ordered')).toBeNull();
    expect(airStatusKey(null)).toBeNull();
  });
});
