import { cancelWatch, subjectTitle, type WatchNext } from '@kromatv/core';
import { useWatchSubject } from '@kromatv/core/react';
import { Preparation, type PreparationProps, useFocusNav } from '@kromatv/ui/kit';
import { useCallback } from 'react';
import { useWatchable } from '#tv/app/providers/watchable';
import { useClient, useNav, useParams } from '#tv/app/router';
import { TvWatchPlayer } from '#tv/features/playback/watch/TvWatchPlayer';

const ART_W = 1280;

function WatchPreparation(props: Readonly<PreparationProps>) {
  useFocusNav({ onBack: props.onBack });
  return <Preparation {...props} />;
}

export function TvWatch() {
  const { subject, poster = null } = useParams('watch');
  const nav = useNav();
  const client = useClient();
  const { sources, source, choose, api, refresh } = useWatchable();
  const { stage, playable, progress, target } = useWatchSubject(subject, api);

  const entry = target?.entry ?? null;
  const title = entry?.title ?? target?.file.name ?? subjectTitle(subject);
  const art = client.media.artwork.resolve(entry?.posterUrl, ART_W) ?? poster;
  const playNext = useCallback(
    (next: WatchNext) => nav.swap('watch', { subject: next.subject, poster: art }),
    [nav, art],
  );
  const leave = () => nav.back();
  const cancel = () => {
    void cancelWatch(api, stage).then(refresh);
    nav.back();
  };

  if (playable && api && source) {
    return (
      <TvWatchPlayer
        watchable={api}
        ready={playable}
        progress={progress}
        source={source}
        title={title ?? ''}
        onPlayNext={playNext}
        onClose={leave}
      />
    );
  }
  return (
    <WatchPreparation
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
