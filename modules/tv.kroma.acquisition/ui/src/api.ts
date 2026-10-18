import type { RequestKind } from '@kromatv/client/requests';
import { InteractiveSearchView } from '@kromatv/client/requests';
import { moduleApiHook } from '@kromatv/module-sdk';
import {
  Acknowledged,
  BlockedRelease,
  CutoffEntry,
  GrabAccepted,
  RulesTestView,
  SearchStarted,
  type SearchUnit,
  TitleRulesView,
  type TitleScope,
} from './judgement-schemas';
import { type CustomFormat, type QualityProfile, RulesView, type Sizes } from './rules-schemas';
import {
  type ManualAddBody,
  ManualAddResult,
  type ManualSearchBody,
  ManualSearchView,
  TorrentAnalysis,
} from './schemas';

const at = (kind: RequestKind, tmdbId: number) => `/acquisition/titles/${kind}/${tmdbId}`;

export const useAcquisitionApi = moduleApiHook('tv.kroma.acquisition', (api) => ({
  /** Pass a `season` (and optionally an `episode`) to search the tracker's TV
   *  categories instead of its movie ones. */
  search: (body: ManualSearchBody) => api.post('/acquisition/search', body, ManualSearchView),
  /** Fetch a torrent's file list and what it holds: metadata only, no download. */
  analyze: (magnetOrUrl: string) =>
    api.post('/acquisition/analyze', { magnetOrUrl }, TorrentAnalysis),
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

  /** Searches the title's missing units now, without reading the backoff.
   *  An empty `units` takes everything the title is missing. */
  searchNow: (kind: RequestKind, tmdbId: number, units: readonly SearchUnit[] = []) =>
    api.post(`${at(kind, tmdbId)}/search-now`, { units }, SearchStarted),
  searchCutoffNow: () => api.post('/acquisition/cutoff/search-now', {}, SearchStarted),

  cutoff: () => api.get('/acquisition/cutoff', CutoffEntry.array()),
  blocklist: () => api.get('/acquisition/blocklist', BlockedRelease.array()),
  unblock: (id: string) =>
    api.delete(`/acquisition/blocklist/${encodeURIComponent(id)}`, Acknowledged),
}));
