import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { HOME_LAYOUTS } from './home-sections';
import { useClient } from './session';

/** The home as the server lays it out. It is asked for again when the saved
 *  titles change, so its `my-list` section follows a save made anywhere in the
 *  app. */
export function useHomeFeed() {
  const client = useClient();
  const queryClient = useQueryClient();
  const feed = client.query.media.homeCards({ layouts: HOME_LAYOUTS });
  const home = useQuery(feed);
  const saved = useQuery(client.query.playback.myList()).data?.join(' ');
  const followed = useRef(saved);

  useEffect(() => {
    if (saved === undefined || saved === followed.current) return;
    const changed = followed.current !== undefined;
    followed.current = saved;
    if (changed) void queryClient.invalidateQueries({ queryKey: feed.queryKey });
  }, [saved, queryClient, feed.queryKey]);

  return home;
}
