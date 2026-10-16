// This module's admin API.
//
// Unlike a module that only ever calls itself, this one is also driven by the
// torrents module's manual-grab flow, so the hook binds an explicit id rather
// than the rendering page's. This is the one place the id is written down, and
// it is the right one: a module publishing the address others reach it at.
// Import from `@kromatv/module-acquisition/api`.

import type { RequestKind } from '@kromatv/client/requests';
import { InteractiveSearchView } from '@kromatv/client/requests';
import { moduleApiHook } from '@kromatv/module-sdk';
import {
  Acknowledged,
  BlockedRelease,
  type CustomFormat,
  CutoffEntry,
  GrabAccepted,
  type QualityProfile,
  RulesTestView,
  RulesView,
  type Sizes,
  TitleRulesView,
  type TitleScope,
} from './rules-schemas';
import {
  type ManualAddBody,
  ManualAddResult,
  type ManualSearchBody,
  ManualSearchView,
  TorrentAnalysis,
} from './schemas';

const at = (kind: RequestKind, tmdbId: number) => `/acquisition/titles/${kind}/${tmdbId}`;

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

  rules: () => api.get('/acquisition/rules', RulesView),
  /** `original` is the title's own language as a tag, which is what an
   *  `original` language condition tests. */
  testRules: (name: string, original: string | null) =>
    api.post('/acquisition/rules/test', { name, original }, RulesTestView),
  saveProfile: (profile: QualityProfile) =>
    api.put(`/acquisition/profiles/${encodeURIComponent(profile.id)}`, profile, Acknowledged),
  deleteProfile: (id: string) =>
    api.delete(`/acquisition/profiles/${encodeURIComponent(id)}`, Acknowledged),
  setDefaultProfile: (id: string) => api.put('/acquisition/default-profile', { id }, Acknowledged),
  saveFormat: (format: CustomFormat) =>
    api.put(`/acquisition/formats/${encodeURIComponent(format.id)}`, format, Acknowledged),
  deleteFormat: (id: string) =>
    api.delete(`/acquisition/formats/${encodeURIComponent(id)}`, Acknowledged),
  saveSizes: (sizes: Sizes) => api.put('/acquisition/sizes', sizes, Acknowledged),

  titleRules: (kind: RequestKind, tmdbId: number) => api.get(at(kind, tmdbId), TitleRulesView),
  /** Null puts the title back under the default profile. */
  setTitleProfile: (kind: RequestKind, tmdbId: number, profileId: string | null) =>
    api.put(`${at(kind, tmdbId)}/profile`, { profileId }, Acknowledged),
  searchTitle: (kind: RequestKind, tmdbId: number, scope: TitleScope) =>
    api.post(`${at(kind, tmdbId)}/search`, { scope }, InteractiveSearchView),
  grabForTitle: (
    kind: RequestKind,
    tmdbId: number,
    body: { scope: TitleScope; guid: string; indexerId: string },
  ) => api.post(`${at(kind, tmdbId)}/grab`, body, GrabAccepted),

  cutoff: () => api.get('/acquisition/cutoff', CutoffEntry.array()),
  blocklist: () => api.get('/acquisition/blocklist', BlockedRelease.array()),
  unblock: (id: string) =>
    api.delete(`/acquisition/blocklist/${encodeURIComponent(id)}`, Acknowledged),
}));
