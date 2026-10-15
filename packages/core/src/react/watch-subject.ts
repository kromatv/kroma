import type {
  WatchableApi,
  WatchableEntry,
  WatchableStartBody,
  WatchableStartOutcome,
} from '@kromatv/client/watchable';
import { useEffect, useMemo, useState } from 'react';
import { downloadOfTitle, watchableTarget } from '../watchable';
import { type Settled, startedDownload, startStage, type WatchSubject } from '../watchable-stage';
import { useWatchScreen, type WatchScreen } from './watch-screen';

const LIST_POLL_MS = 2_000;

function useStableTitle(title: WatchableStartBody | null): WatchableStartBody | null {
  const kind = title?.kind ?? null;
  const tmdbId = title?.tmdbId ?? null;
  const name = title?.title ?? null;
  const year = title?.year ?? null;
  const season = title?.season ?? null;
  const episode = title?.episode ?? null;
  return useMemo(
    () =>
      kind && tmdbId !== null && name !== null
        ? { kind, tmdbId, title: name, year, season, episode }
        : null,
    [kind, tmdbId, name, year, season, episode],
  );
}

function useStarted(
  watchable: Pick<WatchableApi, 'start'> | null | undefined,
  title: WatchableStartBody | null,
): Settled<WatchableStartOutcome> {
  const [outcome, setOutcome] = useState<Settled<WatchableStartOutcome>>('pending');
  useEffect(() => {
    if (!watchable || !title) return;
    let live = true;
    setOutcome('pending');
    void watchable.start(title).then(
      (answer) => {
        if (live) setOutcome(answer);
      },
      () => {
        if (live) setOutcome('failed');
      },
    );
    return () => {
      live = false;
    };
  }, [watchable, title]);
  return outcome;
}

function useListPoll(
  watchable: Pick<WatchableApi, 'list'> | null | undefined,
  following: boolean,
  onEntries: (entries: readonly WatchableEntry[]) => void,
): void {
  useEffect(() => {
    if (!watchable || !following) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      const view = await watchable.list().catch(() => null);
      if (!live) return;
      if (view) onEntries(view.entries);
      timer = setTimeout(() => void ask(), LIST_POLL_MS);
    };
    void ask();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [watchable, following, onEntries]);
}

/** `subject` may be rebuilt on every render; what it names is what is followed. */
export function useWatchSubject(
  subject: WatchSubject | null,
  watchable: WatchableApi | null | undefined,
): WatchScreen {
  const [entries, setEntries] = useState<readonly WatchableEntry[]>([]);
  const title = useStableTitle(subject?.kind === 'title' ? subject.title : null);
  const start = useStarted(watchable, title);
  const started = startedDownload(start);
  const named = subject?.kind === 'download' ? subject.downloadId : (started?.downloadId ?? null);
  const stillSweeping = title !== null && typeof start === 'object' && start.kind === 'timedOut';
  const wanted = subject?.kind === 'download' ? subject.file : title;
  const id = named ?? (stillSweeping && title ? downloadOfTitle(entries, title) : null);
  const target = watchableTarget(entries, id, wanted);
  useListPoll(watchable, (named !== null || stillSweeping) && target === null, setEntries);

  const screen = useWatchScreen({
    watchable,
    target,
    release: started?.release ?? null,
    downloadId: named,
  });
  const sweeping = watchable && subject?.kind === 'title' ? startStage(start) : null;
  return sweeping ? { ...screen, stage: sweeping } : screen;
}
