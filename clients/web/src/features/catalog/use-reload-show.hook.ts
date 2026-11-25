import { type MediaItem, ShowId } from '@kromatv/client/media';
import { useQueryClient } from '@tanstack/react-query';

import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** Waits for a dialog to close, then reloads the show `showId`, so that its page
 * shows what was changed there. */
export function useReloadShow(showId: MediaItem['showId']) {
  const { queries } = useWebRuntime();
  const queryClient = useQueryClient();
  return async (closed: Promise<unknown>) => {
    await closed;
    if (showId) {
      const show = queries.catalogQueries.show(ShowId.parse(showId));
      await queryClient.invalidateQueries({ queryKey: show.queryKey });
    }
  };
}
