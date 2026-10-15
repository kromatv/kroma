import type { WatchableProbe } from '@kromatv/client/watchable';

export interface WatchChapter {
  startMs: number;
  endMs: number;
  title: string;
}

export function watchChapters(probe: Pick<WatchableProbe, 'chapters'>): WatchChapter[] {
  return probe.chapters.map(({ startMs, endMs, title }) => ({
    startMs,
    endMs,
    title: title ?? '',
  }));
}
