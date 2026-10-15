import { cancelWatch, type WatchNext, type WatchSubject } from '@kromatv/core';
import { useWatchSubject } from '@kromatv/core/react';
import { Preparation } from '@kromatv/ui/kit';
import { useCallback } from 'react';
import { WatchablePlayer } from '#web/features/playback/watchable-player';
import { useWatchSubjectRoute } from '#web/shared/lib/watch-route';
import { useWatchable } from '#web/shared/lib/watchable';

export function WatchableWatch({
  subject,
  title,
  art,
  onClose,
}: Readonly<{
  subject: WatchSubject;
  title: string | null;
  art: string | null;
  onClose: () => void;
}>) {
  const { sources, source, choose, api } = useWatchable();
  const { stage, playable, progress, target } = useWatchSubject(subject, api);
  const open = useWatchSubjectRoute();
  const playNext = useCallback((next: WatchNext) => open(next.subject), [open]);

  if (playable && api && source) {
    return (
      <WatchablePlayer
        key={`${playable.target.entry.id}:${playable.target.file.index}`}
        watchable={api}
        ready={playable}
        progress={progress}
        source={source}
        title={title ?? playable.target.entry.title ?? playable.target.file.name}
        onPlayNext={playNext}
        onClose={onClose}
      />
    );
  }
  const cancel = () => {
    void cancelWatch(api, stage);
    onClose();
  };
  return (
    <Preparation
      stage={stage}
      progress={progress}
      source={source}
      sources={sources}
      onSourceChange={choose}
      title={title ?? target?.entry.title ?? null}
      art={art}
      onBack={onClose}
      onCancel={cancel}
    />
  );
}
