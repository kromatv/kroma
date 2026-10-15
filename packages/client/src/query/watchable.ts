import { queryOptions, skipToken } from '@tanstack/react-query';
import type { WatchableApi } from '../api/watchable';

export function watchableList(watchable: WatchableApi | null | undefined) {
  return queryOptions({
    queryKey: ['watchable', 'list'] as const,
    queryFn: watchable ? () => watchable.list() : skipToken,
  });
}
