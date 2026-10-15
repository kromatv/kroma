import type { WatchItem } from '@kromatv/client/watchable';
import type { WatchableTarget } from './watchable';
import type { WatchSubject } from './watchable-stage';

export function watchItem({
  mount,
  target: { entry, file },
}: Readonly<{ mount: string; target: WatchableTarget }>): WatchItem {
  return {
    mount,
    id: entry.id,
    file: file.index,
    title: entry.title ?? file.name,
    poster: entry.posterUrl,
    tmdbId: entry.tmdbId,
    season: file.season,
    episode: file.episode,
  };
}

export function watchSubjectOf(item: Readonly<Pick<WatchItem, 'id' | 'file'>>): WatchSubject {
  return { kind: 'download', downloadId: item.id, file: item.file };
}
