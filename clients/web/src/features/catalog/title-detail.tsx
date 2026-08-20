// The single detail page for a title, owned or not. Fed a normalized `TitleView`

import type { ItemId } from '@kroma/core';
import { useCast, useT } from '@kroma/ui';
import { Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { AiSuggestRail } from '#web/features/catalog/ai-suggest-rail';
import { CastRail, type SimilarItem, SimilarRail } from '#web/features/catalog/detail';
import { SeasonSection } from '#web/features/catalog/episode-list';
import { TitleHero } from '#web/features/catalog/title-hero';
import { TreatmentsPanel } from '#web/features/catalog/treatments-panel';
import { useTitleRequest } from '#web/features/catalog/use-title-request';
import { useAuth } from '#web/shared/lib/auth';
import { useMyList } from '#web/shared/lib/mylist';
import { userQueries } from '#web/shared/lib/queries';
import type { TitleView } from '#web/shared/lib/titleView';
import { useWatched } from '#web/shared/lib/watched';

// The page gutter is a fluid CSS custom property, which no style number can
// carry, so anything indented by it stays a plain element.
const GUTTER: CSSProperties = {
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
};

const PAGE: CSSProperties = { minWidth: 0, paddingBottom: 80, animation: 'fade-in .4s ease' };

type ProgressEntry = { itemId: string; positionMs: number; durationMs?: number | null };

function progressMap(entries: readonly ProgressEntry[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of entries) {
    const dur = e.durationMs ?? 0;
    if (dur > 0 && e.positionMs > 0) {
      map[e.itemId] = Math.min(100, Math.round((e.positionMs / dur) * 100));
    }
  }
  return map;
}

function TitleBody({
  view,
  owned,
  localId,
  error,
  similarItems,
  epProgress,
  busy,
  pendingEps,
  selected,
  isWatched,
  toggleWatched,
  onPlay,
  onToggleEpisode,
  onRequestSelected,
  onRequestSeason,
  onRequestAll,
  onClearSelection,
  onOpenSimilar,
}: Readonly<{
  view: TitleView;
  owned: boolean;
  localId: string | null | undefined;
  error: string | null;
  similarItems: SimilarItem[];
  epProgress: Record<string, number>;
  busy: boolean;
  pendingEps: Set<string>;
  selected: Set<string>;
  isWatched: (id: string) => boolean;
  toggleWatched: (id: string) => void;
  onPlay: (id: string) => void;
  onToggleEpisode: (season: number, episode: number) => void;
  onRequestSelected: () => void;
  onRequestSeason: (season: number) => void;
  onRequestAll: () => void;
  onClearSelection: () => void;
  onOpenSimilar: (key: string) => void;
}>) {
  const t = useT();
  return (
    <>
      {error ? (
        <div style={GUTTER}>
          <Text variant="label" color="dangerHover" mt={8}>
            {error}
          </Text>
        </div>
      ) : null}

      {owned && localId ? (
        <TreatmentsPanel
          kind={view.kind === 'show' ? 'show' : 'item'}
          id={localId}
          title={view.title}
        />
      ) : null}

      {view.kind === 'movie' ? (
        <CastRail cast={view.cast} />
      ) : (
        <SeasonSection
          seasons={view.seasons}
          fallbackCast={view.cast}
          isWatched={isWatched}
          toggleWatched={toggleWatched}
          progressOf={(id) => epProgress[id] ?? null}
          onPlay={onPlay}
          canRequest={view.canRequest}
          selected={selected}
          onToggleEpisode={onToggleEpisode}
          onRequestSelected={onRequestSelected}
          onRequestSeason={onRequestSeason}
          onRequestAll={onRequestAll}
          onClearSelection={onClearSelection}
          pendingEpisodes={pendingEps}
          requestBusy={busy}
        />
      )}

      <SimilarRail title={t('content.similarTitles')} items={similarItems} onOpen={onOpenSimilar} />

      {owned && localId ? <AiSuggestRail id={localId} /> : null}
    </>
  );
}

export function TitleDetail({ initial }: Readonly<{ initial: TitleView }>) {
  const t = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    view,
    busy,
    error,
    selected,
    pendingEps,
    toggleEpisode,
    requestSelected,
    requestSeason,
    requestAllSeasons,
    clearSelection,
    onRequestClick,
  } = useTitleRequest(initial);
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleList } = useMyList();

  const owned = view.localId != null && view.playable != null;
  const localId = view.localId;
  let backTo: '/' | '/series' | '/search' = '/search';
  if (owned) backTo = view.kind === 'show' ? '/series' : '/';

  const { data: epProgress = {} } = useQuery({
    ...userQueries.progress(),
    enabled: !!user && !!localId && view.kind === 'show',
    select: (entries) => progressMap(entries),
  });

  const { active: castDevice, playOn } = useCast();
  const play = (id: string) => {
    if (castDevice) {
      void playOn(castDevice.id, id as ItemId);
      return;
    }
    navigate({ to: '/watch/$id', params: { id } });
  };

  const openSimilar = (key: string) => {
    const s = view.similar.find((x) => x.key === key);
    if (!s) return;
    if (s.localId) {
      navigate({ to: s.kind === 'show' ? '/show/$id' : '/movie/$id', params: { id: s.localId } });
    } else if (s.tmdbId != null) {
      navigate({
        to: '/discover/$type/$tmdbId',
        params: { type: s.kind === 'show' ? 'tv' : 'movie', tmdbId: String(s.tmdbId) },
      });
    }
  };

  const fallbackOverlineKey = view.kind === 'show' ? 'content.series' : 'content.film';
  const overline = view.genres.length
    ? view.genres.slice(0, 3).join(' · ')
    : t(fallbackOverlineKey);
  const similarItems: SimilarItem[] = view.similar.map((s) => ({
    id: s.key,
    title: s.title,
    genre: s.genre,
    badge: null,
    poster: s.poster,
  }));

  return (
    <main style={PAGE}>
      <TitleHero
        view={view}
        owned={owned}
        localId={localId}
        busy={busy}
        overline={overline}
        isWatched={isWatched}
        toggleWatched={toggleWatched}
        inList={inList}
        toggleList={toggleList}
        onPlay={play}
        onRequest={onRequestClick}
        onBack={() => navigate({ to: backTo })}
      />

      <TitleBody
        view={view}
        owned={owned}
        localId={localId}
        error={error}
        similarItems={similarItems}
        epProgress={epProgress}
        busy={busy}
        pendingEps={pendingEps}
        selected={selected}
        isWatched={isWatched}
        toggleWatched={toggleWatched}
        onPlay={play}
        onToggleEpisode={toggleEpisode}
        onRequestSelected={requestSelected}
        onRequestSeason={requestSeason}
        onRequestAll={requestAllSeasons}
        onClearSelection={clearSelection}
        onOpenSimilar={openSimilar}
      />
    </main>
  );
}
