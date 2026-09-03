// This module's admin API.
//
// Unlike a module that only ever calls itself, this one is also driven by the
// torrents module's manual-grab flow, so the hook binds an explicit id rather
// than the rendering page's. This is the one place the id is written down, and
// it is the right one: a module publishing the address others reach it at.
// Import from `@kroma/module-acquisition/api`.

import { moduleApiHook } from '@kroma/module-sdk';
import {
  type ManualAddBody,
  ManualAddResult,
  type ManualSearchBody,
  ManualSearchView,
  TorrentAnalysis,
} from './schemas';

export const useAcquisitionApi = moduleApiHook('tv.kroma.acquisition', (api) => ({
  /** Free-text sweep of every indexer. Pass a `season` (and optionally an
   *  `episode`) to search the tracker's TV categories instead of its movie ones. */
  search: (body: ManualSearchBody) => api.post('/acquisition/search', body, ManualSearchView),
  /** Fetch a torrent's file list (metadata only, no download) + what it
   *  holds, so the admin can pick episodes / confirm the entity first. */
  analyze: (magnetOrUrl: string) =>
    api.post('/acquisition/analyze', { magnetOrUrl }, TorrentAnalysis),
  /** Grab a pasted magnet / .torrent URL (or a manual-search result) and
   *  import it as `kind` into the right library. */
  add: (body: ManualAddBody) => api.post('/acquisition/add', body, ManualAddResult),
}));
