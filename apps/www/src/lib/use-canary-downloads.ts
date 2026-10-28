import { useEffect, useState } from 'react';
import type { ChannelBuild } from './channels';
import { fetchLatestDownloads } from './live-downloads';

/** Keep the baked-in links available while refreshing, and when offline. */
export function useCanaryDownloads(baked: readonly ChannelBuild[], enabled: boolean) {
  const [fresh, setFresh] = useState<ChannelBuild[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    void fetchLatestDownloads(controller.signal).then((builds) => {
      if (!controller.signal.aborted && builds.length > 0) setFresh(builds);
    });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled]);
  return fresh ?? baked;
}
