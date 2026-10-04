import type { MediaItem, UpNext } from '@kromatv/client/media';
import type { ReportSubjectKind } from '@kromatv/client/reports';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import type { IconName } from '@kromatv/ui/kit';
import { useContinue } from '#tv/app/providers/continue';
import { useMyList } from '#tv/app/providers/mylist';
import { useWatched } from '#tv/app/providers/watched';
import { useClient, useNav } from '#tv/app/router';
import type { HeldTitle } from '#tv/features/catalog/TitleMenu';
import { useOpenShow, useUpNext } from '#tv/features/catalog/useTitleTargets';

/** One row of the title menu. Its `id` holds still while its label changes,
 * so a row the server relabels keeps the focus. */
export interface TitleAction {
  id: string;
  icon: IconName;
  label: string;
  run: () => void;
}

function playLabel(t: Translate, item: MediaItem, resume: boolean): string {
  if (item.season === null || item.episode === null) {
    return t(resume ? 'player.resume' : 'player.play');
  }
  return t(resume ? 'player.resumeEpisode' : 'player.playEpisode', {
    season: item.season,
    episode: item.episode,
  });
}

function reportKind(title: HeldTitle): ReportSubjectKind {
  if (title.kind === 'show') return 'show';
  return title.item.kind === 'episode' ? 'episode' : 'movie';
}

/** What the title menu offers for a title: play first and report last, on
 * every title. A series plays the episode the server says it continues with,
 * named once the answer lands; an episode also opens its series. */
export function useTitleActions(title: HeldTitle): TitleAction[] {
  const t = useT();
  const nav = useNav();
  const client = useClient();
  const myList = useMyList();
  const watched = useWatched();
  const openShow = useOpenShow();
  const { refresh } = useContinue();
  const upNext = useUpNext(title.kind === 'show' ? title.item.id : null);
  const subject = title.item;

  const playItem = (item: MediaItem, resume: boolean): TitleAction => ({
    id: 'play',
    icon: 'player-play-filled',
    label: playLabel(t, item, resume),
    run: () => nav.go('player', { item }),
  });
  const listed = myList.has(subject.id);
  const list: TitleAction = {
    id: 'list',
    icon: listed ? 'bookmark-off' : 'bookmark',
    label: t(listed ? 'content.removeFromList' : 'content.addToList'),
    run: () => myList.toggle(subject.id),
  };
  const seen = watched.has(subject.id);
  const markWatched: TitleAction = {
    id: 'watched',
    icon: seen ? 'eye-off' : 'check',
    label: t(seen ? 'content.markUnwatched' : 'content.markWatched'),
    run: () => watched.toggle(subject.id),
  };
  const report: TitleAction = {
    id: 'report',
    icon: 'flag',
    label: t('report.action'),
    run: () => nav.go('report', { kind: reportKind(title), id: subject.id, title: subject.title }),
  };

  if (title.kind === 'movie') return [playItem(title.item, false), list, markWatched, report];
  if (title.kind === 'show') {
    const showId = title.item.id;
    const start = (next: UpNext | null) => {
      if (next) nav.go('player', { item: next.item });
    };
    const play: TitleAction = {
      id: 'play',
      icon: 'player-play-filled',
      label: upNext ? playLabel(t, upNext.item, upNext.resume) : t('player.play'),
      run: () => {
        if (upNext) start(upNext);
        else client.playback.upNext(showId).then(start, () => undefined);
      },
    };
    return [play, list, markWatched, report];
  }

  const item = title.item;
  const showId = item.showId;
  const series: TitleAction[] =
    showId === null
      ? []
      : [
          {
            id: 'series',
            icon: 'device-tv',
            label: t('content.openShow'),
            run: () => openShow(showId),
          },
        ];
  if (title.kind === 'episode') return [playItem(item, false), ...series, markWatched, report];

  const info: TitleAction[] =
    item.kind === 'movie'
      ? [
          {
            id: 'info',
            icon: 'info-circle',
            label: t('content.moreInfo'),
            run: () => nav.go('movie', { item }),
          },
        ]
      : [];
  const forget: TitleAction = {
    id: 'forget',
    icon: 'x',
    label: t('content.removeFromContinue'),
    run: () => {
      client.playback
        .forget(item.id)
        .then(refresh)
        .catch(() => undefined);
    },
  };
  return [playItem(item, true), ...series, ...info, forget, report];
}
