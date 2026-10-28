import { toCanaryBuilds, type ChannelBuild } from './channels';
import { Feed } from './release-feed';

/** The prerendered files stay usable if the short, same-origin refresh fails. */
export async function fetchLatestDownloads(signal: AbortSignal): Promise<ChannelBuild[]> {
  try {
    const response = await fetch('/api/downloads/canary.json', { signal });
    if (!response.ok) return [];
    return toCanaryBuilds(Feed.parse(await response.json()));
  } catch {
    return [];
  }
}
