import { apiErrorText, type EpisodeRef } from '@kroma/core';
import { useT } from '@kroma/ui';
import { useState } from 'react';
import { EPISODES_ANCHOR } from '#web/features/catalog/episode-list';
import { epKey, toEpisodeRefs, toggle } from '#web/features/catalog/episode-selection';
import { useAuth } from '#web/shared/lib/auth';
import type { TitleView } from '#web/shared/lib/titleView';

function nextViewAfterRequest(
  v: TitleView,
  status: TitleView['requestStatus'],
  seasons: number[] | null,
  episodes?: EpisodeRef[],
): TitleView {
  if (episodes?.length) return { ...v, requestStatus: status };
  const target = new Set(
    seasons ?? v.seasons.filter((s) => !s.available && !s.requested).map((s) => s.number),
  );
  return {
    ...v,
    requestStatus: status,
    seasons: v.seasons.map((s) => (target.has(s.number) ? { ...s, requested: true } : s)),
  };
}

function addPendingEpisodes(prev: Set<string>, episodes: EpisodeRef[]): Set<string> {
  const next = new Set(prev);
  for (const e of episodes) next.add(epKey(e.season, e.episode));
  return next;
}

export interface TitleRequestState {
  view: TitleView;
  busy: boolean;
  error: string | null;
  selected: Set<string>;
  pendingEps: Set<string>;
  toggleEpisode: (season: number, episode: number) => void;
  requestSelected: () => void;
  requestSeason: (season: number) => void;
  requestAllSeasons: () => void;
  clearSelection: () => void;
  onRequestClick: () => void;
}

/** Owns the acquisition-request half of the detail page: the locally patched
 * `view`, the episode selection, and every button that files a request. */
export function useTitleRequest(initial: TitleView): TitleRequestState {
  const t = useT();
  const { client } = useAuth();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pendingEps, setPendingEps] = useState<Set<string>>(() => new Set());

  const doRequest = (seasons: number[] | null, episodes?: EpisodeRef[]) => {
    if (view.tmdbId == null) return;
    setBusy(true);
    setError(null);
    client
      .createRequest({ kind: view.kind, tmdbId: view.tmdbId, seasons, episodes })
      .then((req) => {
        setView((v) => nextViewAfterRequest(v, req.status, seasons, episodes));
        if (episodes?.length) setPendingEps((prev) => addPendingEpisodes(prev, episodes));
        setSelected(new Set());
      })
      .catch((e) => setError(apiErrorText(e, t('discover.requestFailed'))))
      .finally(() => setBusy(false));
  };

  const toggleEpisode = (season: number, episode: number) =>
    setSelected((prev) => toggle(prev, epKey(season, episode)));
  const requestSelected = () => {
    const episodes = toEpisodeRefs(selected);
    if (episodes.length > 0) doRequest(null, episodes);
  };
  const requestSeason = (season: number) => doRequest([season]);
  const requestAllSeasons = () => doRequest(null);
  const onRequestClick = () => {
    // With no season list there is no section to scroll to and nothing to pick,
    // so the button asks for the whole show rather than doing nothing at all.
    if (view.kind !== 'show' || view.seasons.length === 0) {
      doRequest(null);
      return;
    }
    document.getElementById(EPISODES_ANCHOR)?.scrollIntoView({ behavior: 'smooth' });
  };

  return {
    view,
    busy,
    error,
    selected,
    pendingEps,
    toggleEpisode,
    requestSelected,
    requestSeason,
    requestAllSeasons,
    clearSelection: () => setSelected(new Set()),
    onRequestClick,
  };
}
