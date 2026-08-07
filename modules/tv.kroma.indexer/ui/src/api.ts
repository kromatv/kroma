// This module's own admin API, served by its sidecar under the mount the host
// derives from its id — `moduleApiHook` binds it, so the id is never repeated
// here.

import { moduleApiHook } from '@kroma/module-sdk';
import type {
  IndexerDefinitionDetailView,
  IndexerDefinitionsView,
  IndexersView,
  IndexerTestResult,
  IndexerView,
  SaveIndexerBody,
  SyncDefinitionsResult,
} from './schemas';

const enc = encodeURIComponent;

export const useIndexerApi = moduleApiHook((api) => ({
  list: () => api.get<IndexersView>('/indexers'),
  create: (body: SaveIndexerBody) => api.post<IndexerView>('/indexers', body),
  /** Partial update: an omitted field keeps its value, apiKey included. */
  update: (id: string, body: SaveIndexerBody) => api.put<IndexerView>(`/indexers/${enc(id)}`, body),
  remove: (id: string) => api.delete<void>(`/indexers/${enc(id)}`),
  /** Live t=caps round-trip: latency, server title, TMDB id support. */
  test: (id: string) => api.post<IndexerTestResult>(`/indexers/${enc(id)}/test`),
  /** Browse the cached Cardigann definition catalog (built-in indexers). */
  definitions: () => api.get<IndexerDefinitionsView>('/indexers/definitions'),
  /** The settings schema for one definition (drives the add form). */
  definition: (id: string) =>
    api.get<IndexerDefinitionDetailView>(`/indexers/definitions/${enc(id)}`),
  /** Fetch the current definition set from upstream into the local cache. */
  syncDefinitions: () => api.post<SyncDefinitionsResult>('/indexers/definitions/sync'),
}));
