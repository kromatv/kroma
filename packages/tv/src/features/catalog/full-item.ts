import type { KromaClient } from '@kromatv/client';
import type { MediaCard, MediaItem } from '@kromatv/client/media';
import { useCallback, useEffect, useState } from 'react';
import { useClient, useNav } from '#tv/app/router';

const isFullItem = (title: MediaCard): title is MediaItem => 'files' in title;

/** The playable item behind a catalogue card: the card itself when it already is
 * one, else one `GET /api/items/:id`, shared with any request for it in flight. */
export function fullItem(client: KromaClient, title: MediaCard): Promise<MediaItem> {
  return isFullItem(title) ? Promise.resolve(title) : client.media.item(title.id);
}

/** {@link fullItem} as state: null until the item lands, and whenever it cannot. */
export function useFullItem(title: MediaCard): MediaItem | null {
  const client = useClient();
  const [loaded, setLoaded] = useState<{ client: KromaClient; item: MediaItem } | null>(null);

  useEffect(() => {
    if (isFullItem(title)) return;
    let cancelled = false;
    client.media.item(title.id).then(
      (item) => {
        if (!cancelled) setLoaded({ client, item });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [client, title]);

  if (isFullItem(title)) return title;
  return loaded?.client === client && loaded.item.id === title.id ? loaded.item : null;
}

/** Opens the player on a catalogue title, fetching what it plays first when the
 * card does not carry it. */
export function usePlayTitle(): (title: MediaCard) => void {
  const client = useClient();
  const nav = useNav();
  return useCallback(
    (title: MediaCard) => {
      fullItem(client, title).then(
        (item) => nav.go('player', { item }),
        () => undefined,
      );
    },
    [client, nav],
  );
}
