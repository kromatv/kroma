// This module's admin API: downloads, the download clients behind them, and
// the naming/organize tools. `moduleApiHook` binds it to the module the host is
// rendering, so the id is never repeated here.

import type { TorrentAnalysis } from '@kroma/module-acquisition/schemas';
import { moduleApiHook } from '@kroma/module-sdk';
import type { VpnBandwidthRange, VpnBandwidthView } from '@kroma/module-vpn/schemas';
import type {
  ClientTestResult,
  DownloadClientsView,
  DownloadClientView,
  DownloadQuery,
  DownloadsView,
  EpisodeInfo,
  InspectedTorrent,
  LimitsView,
  LinkBody,
  MatchCandidatesView,
  NamingTemplatesView,
  NamingView,
  OrganizePlan,
  OrganizeResult,
  SampleNames,
  SaveDownloadClientBody,
} from './schemas';

const enc = encodeURIComponent;

type QueryValue = string | number | boolean | null | undefined;

function queryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export const useTorrentsApi = moduleApiHook((api) => ({
  downloads: (query: DownloadQuery = {}) =>
    api.get<DownloadsView>(`/downloads${queryString({ ...query })}`),
  pause: (id: string) => api.post<void>(`/downloads/${enc(id)}/pause`),
  resume: (id: string) => api.post<void>(`/downloads/${enc(id)}/resume`),
  /** Re-attempt a failed grab (re-adds the torrent in the background). */
  retry: (id: string) => api.post<void>(`/downloads/${enc(id)}/retry`),
  /** Force a tracker/DHT re-announce ("ask more peers") for one download. */
  reannounce: (id: string) => api.post<void>(`/downloads/${enc(id)}/reannounce`),
  remove: (id: string, opts?: { deleteData?: boolean }) =>
    api.delete<void>(`/downloads/${enc(id)}${opts?.deleteData ? '?deleteData=true' : ''}`),
  /** Pause every active KROMA download (foreign torrents in a shared client
   *  are left untouched). Returns how many were paused. */
  pauseAll: () => api.post<{ count: number }>('/downloads/pause-all'),
  /** Resume every KROMA download we previously paused. */
  resumeAll: () => api.post<{ count: number }>('/downloads/resume-all'),
  /** Force a re-announce on every active download. */
  reannounceAll: () => api.post<{ count: number }>('/downloads/reannounce'),

  /** What a `.torrent` an operator picked says about itself. Queues nothing:
   *  the bytes are kept and the manual-add flow carries on from the magnet. They
   *  go up raw because there is no JSON shape for a file. */
  inspectTorrent: (file: Blob) =>
    api.send<InspectedTorrent>('/downloads/torrent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-bittorrent' },
      body: file,
    }),

  /** How much the engine moved over `range`, split by whether the VPN bridge
   *  carried it. */
  bandwidth: (range: VpnBandwidthRange) =>
    api.get<VpnBandwidthView>(`/downloads/bandwidth?range=${range}`),

  /** The engine-wide throughput and parallelism ceilings. */
  limits: () => api.get<LimitsView>('/downloads/limits'),
  saveLimits: (body: LimitsView) => api.put<LimitsView>('/downloads/limits', body),

  /** Titles this download could be for, ranked. `q` overrides the search text
   *  when the parsed release name is the reason nothing matched. */
  candidates: (id: string, q?: string, kind?: string) =>
    api.get<MatchCandidatesView>(`/downloads/${enc(id)}/candidates${queryString({ q, kind })}`),
  /** Ranked titles for words an operator typed, with no download row yet: what
   *  the manual-add flow pins a title with before anything is queued. */
  searchTitles: (q: string, kind?: string, year?: number) =>
    api.get<MatchCandidatesView>(`/downloads/candidates${queryString({ q, kind, year })}`),
  /** What a queued torrent actually holds. The row carries its own link on
   *  the server, so nothing hands a magnet back to the browser to ask. */
  contents: (id: string) => api.get<TorrentAnalysis>(`/downloads/${enc(id)}/contents`),
  /** What the provider calls each episode of one season, so a file list reads
   *  as episodes rather than as filenames. Empty when it knows none. */
  episodes: (tmdbId: number, season: number) =>
    api.get<EpisodeInfo[]>(`/downloads/episodes${queryString({ tmdbId, season })}`),
  /** Pin the title, at any stage of the download. */
  link: (id: string, body: LinkBody) => api.put<void>(`/downloads/${enc(id)}/link`, body),

  clients: () => api.get<DownloadClientsView>('/download-clients'),
  createClient: (body: SaveDownloadClientBody) =>
    api.post<DownloadClientView>('/download-clients', body),
  updateClient: (id: string, body: SaveDownloadClientBody) =>
    api.put<DownloadClientView>(`/download-clients/${enc(id)}`, body),
  deleteClient: (id: string) => api.delete<void>(`/download-clients/${enc(id)}`),
  testClient: (id: string) => api.post<ClientTestResult>(`/download-clients/${enc(id)}/test`),

  /** Current templates + a rendered sample. */
  naming: () => api.get<NamingView>('/organize/naming'),
  /** Render a sample for the given (unsaved) templates, for the live preview. */
  namingSample: (templates: NamingTemplatesView) =>
    api.post<SampleNames>('/organize/sample', templates),
  saveNaming: (templates: NamingTemplatesView) => api.put<void>('/organize/naming', templates),
  /** Non-destructive: library files that don't match the templates. */
  organizePreview: () => api.get<OrganizePlan>('/organize/preview'),
  /** Destructive: rename mismatched files to match the templates. */
  organizeApply: () => api.post<OrganizeResult>('/organize/apply'),
}));
