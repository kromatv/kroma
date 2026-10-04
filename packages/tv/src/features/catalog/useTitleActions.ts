import type { MediaItem, ShowId, UpNext } from '@kromatv/client/media';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import type { IconName } from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';
import { useContinue } from '#tv/app/providers/continue';
import { useMyList } from '#tv/app/providers/mylist';
import { useWatched } from '#tv/app/providers/watched';
import { useClient, useNav } from '#tv/app/router';
import type { HeldTitle } from '#tv/features/catalog/TitleMenu';

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

function useUpNext(showId: ShowId | null): UpNext | null {
  const client = useClient();
  const [answer, setAnswer] = useState<{ showId: ShowId; next: UpNext | null } | null>(null);
  useEffect(() => {
    if (showId === null) return;
    let cancelled = false;
    client.playback
      .upNext(showId)
      .then((next) => {
        if (!cancelled) setAnswer({ showId, next });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, showId]);
  return answer?.showId === showId ? answer.next : null;
}

/** What the title menu offers for a title, play first. A series plays the
 * episode the server says it continues with, named once the answer lands. */
export function useTitleActions(title: HeldTitle): TitleAction[] {
  const t = useT();
  const nav = useNav();
  const client = useClient();
  const myList = useMyList();
  const watched = useWatched();
  const { refresh } = useContinue();
  const upNext = useUpNext(title.kind === 'show' ? title.item.id : null);
  const subject = title.item;

  if (title.kind === 'resume') {
    const resume: TitleAction = {
      id: 'play',
      icon: 'player-play-filled',
      label: playLabel(t, title.item, true),
      run: () => nav.go('player', { item: title.item }),
    };
    const forget: TitleAction = {
      id: 'forget',
      icon: 'x',
      label: t('content.removeFromContinue'),
      run: () => {
        client.playback
          .forget(title.item.id)
          .then(refresh)
          .catch(() => undefined);
      },
    };
    if (title.item.kind !== 'movie') return [resume, forget];
    const info: TitleAction = {
      id: 'info',
      icon: 'info-circle',
      label: t('content.moreInfo'),
      run: () => nav.go('movie', { item: title.item }),
    };
    return [resume, info, forget];
  }

  const play: TitleAction =
    title.kind === 'movie'
      ? {
          id: 'play',
          icon: 'player-play-filled',
          label: t('player.play'),
          run: () => nav.go('player', { item: title.item }),
        }
      : {
          id: 'play',
          icon: 'player-play-filled',
          label: upNext ? playLabel(t, upNext.item, upNext.resume) : t('player.play'),
          run: () => {
            const start = (next: UpNext | null) => {
              if (next) nav.go('player', { item: next.item });
            };
            if (upNext) start(upNext);
            else client.playback.upNext(title.item.id).then(start, () => undefined);
          },
        };
  const listed = myList.has(subject.id);
  const seen = watched.has(subject.id);
  return [
    play,
    {
      id: 'list',
      icon: listed ? 'bookmark-off' : 'bookmark',
      label: t(listed ? 'content.removeFromList' : 'content.addToList'),
      run: () => myList.toggle(subject.id),
    },
    {
      id: 'watched',
      icon: seen ? 'eye-off' : 'check',
      label: t(seen ? 'content.markUnwatched' : 'content.markWatched'),
      run: () => watched.toggle(subject.id),
    },
    {
      id: 'report',
      icon: 'flag',
      label: t('report.action'),
      run: () => nav.go('report', { kind: title.kind, id: subject.id, title: subject.title }),
    },
  ];
}
