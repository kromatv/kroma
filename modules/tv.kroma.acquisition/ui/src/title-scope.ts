import type { SearchScope } from '@kromatv/client/requests';
import type { TitleScope } from './judgement-schemas';

export function toTitleScope(scope: SearchScope): TitleScope {
  switch (scope.scope) {
    case 'all':
      return { kind: 'all' };
    case 'movie':
      return { kind: 'movie' };
    case 'season':
      return { kind: 'season', season: scope.season };
    case 'episode':
      return { kind: 'episode', season: scope.season, episode: scope.episode };
  }
}
