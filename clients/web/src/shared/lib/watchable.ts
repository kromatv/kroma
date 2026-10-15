import { useWatchSources, type WatchSources } from '@kromatv/core/react';
import { useT } from '@kromatv/ui';
import { useAuth } from '#web/shared/lib/auth';

export function useWatchable(): WatchSources {
  return useWatchSources(useAuth().client, useT());
}
