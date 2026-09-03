import { ItemId, type SubjectId } from '@kroma/client/media';
import { formatRuntime } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, type HostElement } from '@kroma/ui/kit';
import {
  audioFlagLabel,
  audioString,
  DetailHero,
  langName,
  qualityBadges,
  subString,
} from '#web/features/catalog/detail';
import { ReportDialog } from '#web/features/catalog/report-dialog';
import { savedTitleId } from '#web/shared/lib/saved-title-id';
import { type TitleView, tmdbMetaLine } from '#web/shared/lib/titleView';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';

export function TitleHero({
  view,
  owned,
  localId,
  busy,
  overline,
  isWatched,
  toggleWatched,
  inList,
  toggleList,
  onPlay,
  onRequest,
  back,
}: Readonly<{
  view: TitleView;
  owned: boolean;
  localId: string | null | undefined;
  busy: boolean;
  overline: string;
  isWatched: (id: SubjectId) => boolean;
  toggleWatched: (id: SubjectId) => void;
  inList: (id: SubjectId) => boolean;
  toggleList: (id: SubjectId) => void;
  onPlay: (id: ItemId) => void;
  onRequest: () => void;
  back: HostElement;
}>) {
  const t = useT();
  const playable = owned ? view.playable : null;
  const listId = savedTitleId(view.kind, localId, view.tmdbId);
  const listState: {
    watched?: boolean;
    onToggleWatched?: () => void;
    inList?: boolean;
    onToggleList?: () => void;
  } = {};
  if (listId) {
    listState.watched = isWatched(listId);
    listState.onToggleWatched = () => toggleWatched(listId);
    listState.inList = inList(listId);
    listState.onToggleList = () => toggleList(listId);
  }
  const trackInfo: { audio?: string; subtitles?: string } = playable
    ? { audio: audioString(t, playable), subtitles: subString(t, playable) }
    : {};
  return (
    <DetailHero
      art={{
        id: localId ?? String(view.tmdbId ?? view.title),
        backdrop: view.backdrop,
        poster: view.poster,
      }}
      overline={overline}
      title={view.title}
      rating={view.rating}
      meta={metaLine(t, view)}
      badges={view.video ? qualityBadges(view.video) : []}
      audioFlag={owned ? audioFlagLabel(t, view.playable) : null}
      directors={view.directors}
      tagline={view.tagline}
      overview={view.overview}
      audio={trackInfo.audio}
      subtitles={trackInfo.subtitles}
      playable={playable}
      playLabel={view.playLabel ?? undefined}
      themeUrl={view.themeUrl}
      watched={listState.watched}
      castItemId={owned && localId ? ItemId.parse(localId) : undefined}
      onToggleWatched={listState.onToggleWatched}
      inList={listState.inList}
      onToggleList={listState.onToggleList}
      primaryAction={
        owned ? undefined : <RequestCta view={view} busy={busy} onRequest={onRequest} />
      }
      back={back}
      onPlay={playable ? () => onPlay(playable.id) : undefined}
      onReport={
        owned && localId
          ? () =>
              void ReportDialog.call({
                subjectKind: view.kind,
                subjectId: localId,
                subjectTitle: view.title,
              })
          : undefined
      }
    />
  );
}

function RequestCta({
  view,
  busy,
  onRequest,
}: Readonly<{ view: TitleView; busy: boolean; onRequest: () => void }>) {
  const t = useT();
  if (view.requestStatus && view.requestStatus !== 'denied') {
    return (
      <RequestStatusChip status={view.requestStatus} size="hero" progress={view.requestProgress} />
    );
  }
  if (!view.canRequest) return null;
  return (
    <Button
      icon="plus"
      label={view.kind === 'show' ? t('discover.requestShow') : t('discover.request')}
      onPress={onRequest}
      loading={busy}
    />
  );
}

function metaLine(t: ReturnType<typeof useT>, view: TitleView): string {
  if (view.kind === 'show') {
    const episodes = view.seasons.reduce((n, s) => n + (s.episodes.length || s.episodeCount), 0);
    return [
      view.year ? String(view.year) : null,
      t('content.seasonCount', { count: view.seasons.length }),
      t('content.episodeCount', { count: episodes }),
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (view.playable) {
    return [
      view.year ? String(view.year) : null,
      formatRuntime(view.playable.durationMs),
      langName(t, view.playable.audio?.language),
    ]
      .filter(Boolean)
      .join(' · ');
  }
  return tmdbMetaLine(view.year, view.runtimeMin);
}
