import type { RequestKind, SearchScope } from '@kromatv/client/requests';
import type { JudgedFile } from './judgement-schemas';

/** The narrowest search that still covers every file under its goal: the
 *  film, one episode, the one season they share, or the whole show. */
export function upgradeScope(kind: RequestKind, files: readonly JudgedFile[]): SearchScope {
  if (kind === 'movie') return { scope: 'movie' };
  const below = files.filter((file) => file.belowTarget && file.season != null);
  const seasons = new Set(below.map((file) => file.season));
  const [season] = seasons;
  if (seasons.size !== 1 || season == null) return { scope: 'all' };
  const [only, ...rest] = below;
  const episode = only?.episode;
  const single = rest.length === 0 && episode != null && (only?.episodeEnd ?? episode) === episode;
  return single ? { scope: 'episode', season, episode } : { scope: 'season', season };
}
