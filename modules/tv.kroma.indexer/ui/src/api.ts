// This module's own admin API, served by its sidecar under the mount the host
// derives from its id; `moduleApiHook` binds it, so the id is never repeated
// here.

import { moduleApiHook } from '@kroma/module-sdk';
import {
  IndexerDefinitionDetailView,
  IndexerDefinitionsView,
  IndexersView,
  IndexerTestResult,
  IndexerView,
  type SaveIndexerBody,
  SyncDefinitionsResult,
} from './schemas';

const enc = encodeURIComponent;

export const useIndexerApi = moduleApiHook((api) => ({
  list: () => api.get('/indexers', IndexersView),
  create: (body: SaveIndexerBody) => api.post('/indexers', body, IndexerView),
  /** Partial update: an omitted field keeps its value, apiKey included. */
  update: (id: string, body: SaveIndexerBody) => api.put(`/indexers/${enc(id)}`, body, IndexerView),
  remove: (id: string) => api.delete(`/indexers/${enc(id)}`),
  /** Live t=caps round-trip: latency, server title, TMDB id support. */
  test: (id: string) => api.post(`/indexers/${enc(id)}/test`, undefined, IndexerTestResult),
  /** Browse the cached Cardigann definition catalog (built-in indexers). */
  definitions: () => api.get('/indexers/definitions', IndexerDefinitionsView),
  /** The settings schema for one definition (drives the add form). */
  definition: (id: string) =>
    api.get(`/indexers/definitions/${enc(id)}`, IndexerDefinitionDetailView),
  /** Fetch the current definition set from upstream into the local cache. */
  syncDefinitions: () => api.post('/indexers/definitions/sync', undefined, SyncDefinitionsResult),
}));
