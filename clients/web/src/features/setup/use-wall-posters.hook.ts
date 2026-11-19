import type { SplashEntry } from '@kromatv/client/media';
import { useQuery } from '@tanstack/react-query';
import { ownFirst } from '#web/features/setup/scan-feed';
import { wallSize } from '#web/shared/ui/poster-wall.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const ENOUGH = 12;
const ASK_AGAIN_MS = 4000;
const WIDEST_WALL = wallSize(8);

/** The artwork a wall shows for one title: its poster, else its backdrop. */
export function wallPoster(entry: SplashEntry): string {
  return entry.posterUrl ?? entry.backdropUrl;
}

/** Whether the server is still gathering artwork: a short sample, which it
 * fills in the background with what the world watches this week. */
export function stillGathering(entries: readonly SplashEntry[] | undefined): boolean {
  return (entries?.length ?? 0) < ENOUGH;
}

/** What fills the wall around the library's own posters: the whole public
 * sample for a wall with none of its own, else only what the world watches,
 * since the library's own titles are on the wall already. */
export function wallFill(
  entries: readonly SplashEntry[],
  { hasOwn }: { hasOwn: boolean },
): string[] {
  const kept = hasOwn ? entries.filter((entry) => entry.trending) : entries;
  return kept.map(wallPoster);
}

/** The posters behind the setup: the library's own as the scan matches them,
 * and around them the server's public sample, asked again while it is short. */
export function useWallPosters(own: readonly string[]): string[] {
  const { queries } = useWebRuntime();
  const { data = [] } = useQuery({
    ...queries.serverQueries.splash(),
    refetchInterval: (query) => (stillGathering(query.state.data) ? ASK_AGAIN_MS : false),
  });
  return ownFirst(own, wallFill(data, { hasOwn: own.length > 0 }), WIDEST_WALL);
}
