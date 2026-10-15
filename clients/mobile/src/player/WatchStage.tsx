import { cancelWatch, subjectTitle, type WatchNext, type WatchSubject } from '@kromatv/core';
import { useWatchSubject } from '@kromatv/core/react';
import { Preparation } from '@kromatv/ui/kit';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useI18n } from '#mobile/lib/i18n';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { useWatchable, watchSubjectRoute } from '#mobile/lib/watchable';
import { WatchBody } from '#mobile/player/WatchBody';

const ART_W = 780;

export function WatchStage({
  subject,
  poster = null,
}: Readonly<{ subject: WatchSubject | null; poster?: string | null }>) {
  const client = useClient();
  const router = useRouter();
  const { t } = useI18n();
  useKeepAwake();
  const { sources, source, choose, api } = useWatchable();
  const { stage, playable, progress, target } = useWatchSubject(subject, api);

  const entry = target?.entry ?? null;
  const title = entry?.title ?? target?.file.name ?? (subject ? subjectTitle(subject) : null);
  const art = client.media.artwork.resolve(entry?.posterUrl, ART_W) ?? poster;
  const leave = () => goBack(router);
  const cancel = () => {
    void cancelWatch(api, stage);
    goBack(router);
  };
  const playNext = useCallback(
    (next: WatchNext) => router.replace(watchSubjectRoute(next.subject) as never),
    [router],
  );

  if (playable && api && source) {
    return (
      <WatchBody
        watchable={api}
        stage={playable}
        progress={progress}
        source={source}
        title={title ?? t('requests.watchNow')}
        poster={art}
        onPlayNext={playNext}
        onLeave={leave}
      />
    );
  }
  return (
    <Preparation
      stage={stage}
      progress={progress}
      source={source}
      sources={sources}
      onSourceChange={choose}
      title={title}
      art={art}
      onBack={leave}
      onCancel={cancel}
    />
  );
}
