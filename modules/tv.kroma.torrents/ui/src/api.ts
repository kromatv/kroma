// This module's admin API: downloads, the download clients behind them, and
// the naming/organize tools. `moduleApiHook` binds it to the module the host is
// rendering, so the id is never repeated here.

import { TorrentAnalysis } from '@kroma/module-acquisition/schemas';
import { moduleApiHook } from '@kroma/module-sdk';
import { type VpnBandwidthRange, VpnBandwidthView } from '@kroma/module-vpn/schemas';
import {
  BulkActionResult,
  ClientTestResult,
  DownloadClientsView,
  DownloadClientView,
  type DownloadQuery,
  DownloadsView,
  EpisodeInfoList,
  InspectedTorrent,
  LimitsView,
  type LinkBody,
  MatchCandidatesView,
  type NamingTemplatesView,
  NamingView,
  OrganizePlan,
  OrganizeResult,
  SampleNames,
  type SaveDownloadClientBody,
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
    api.get(`/downloads${queryString({ ...query })}`, DownloadsView),
  pause: (id: string) => api.post(`/downloads/${enc(id)}/pause`),
  resume: (id: string) => api.post(`/downloads/${enc(id)}/resume`),
  /** Re-attempt a failed grab (re-adds the torrent in the background). */
  retry: (id: string) => api.post(`/downloads/${enc(id)}/retry`),
  /** Force a tracker/DHT re-announce ("ask more peers") for one download. */
  reannounce: (id: string) => api.post(`/downloads/${enc(id)}/reannounce`),
  remove: (id: string, opts?: { deleteData?: boolean }) =>
    api.delete(`/downloads/${enc(id)}${opts?.deleteData ? '?deleteData=true' : ''}`),
  /** Pause every active KROMA download (foreign torrents in a shared client
   *  are left untouched). Returns how many were paused. */
  pauseAll: () => api.post('/downloads/pause-all', undefined, BulkActionResult),
  /** Resume every KROMA download we previously paused. */
  resumeAll: () => api.post('/downloads/resume-all', undefined, BulkActionResult),
  /** Force a re-announce on every active download. */
  reannounceAll: () => api.post('/downloads/reannounce', undefined, BulkActionResult),

  /** What a `.torrent` an operator picked says about itself. Queues nothing:
   *  the bytes are kept and the manual-add flow carries on from the magnet. They
   *  go up raw because there is no JSON shape for a file. */
  inspectTorrent: (file: Blob) =>
    api.upload('/downloads/torrent', file, InspectedTorrent, {
      'Content-Type': 'application/x-bittorrent',
    }),

  /** How much the engine moved over `range`, split by whether the VPN bridge
   *  carried it. */
  bandwidth: (range: VpnBandwidthRange) =>
    api.get(`/downloads/bandwidth?range=${range}`, VpnBandwidthView),

  /** The engine-wide throughput and parallelism ceilings. */
  limits: () => api.get('/downloads/limits', LimitsView),
  saveLimits: (body: LimitsView) => api.put('/downloads/limits', body, LimitsView),

  /** Titles this download could be for, ranked. `q` overrides the search text
   *  when the parsed release name is the reason nothing matched. */
  candidates: (id: string, q?: string, kind?: string) =>
    api.get(`/downloads/${enc(id)}/candidates${queryString({ q, kind })}`, MatchCandidatesView),
  /** Ranked titles for words an operator typed, with no download row yet: what
   *  the manual-add flow pins a title with before anything is queued. */
  searchTitles: (q: string, kind?: string, year?: number) =>
    api.get(`/downloads/candidates${queryString({ q, kind, year })}`, MatchCandidatesView),
  /** What a queued torrent actually holds. The row carries its own link on
   *  the server, so nothing hands a magnet back to the browser to ask. */
  contents: (id: string) => api.get(`/downloads/${enc(id)}/contents`, TorrentAnalysis),
  /** What the provider calls each episode of one season, so a file list reads
   *  as episodes rather than as filenames. Empty when it knows none. */
  episodes: (tmdbId: number, season: number) =>
    api.get(`/downloads/episodes${queryString({ tmdbId, season })}`, EpisodeInfoList),
  /** Pin the title, at any stage of the download. */
  link: (id: string, body: LinkBody) => api.put(`/downloads/${enc(id)}/link`, body),

  clients: () => api.get('/download-clients', DownloadClientsView),
  createClient: (body: SaveDownloadClientBody) =>
    api.post('/download-clients', body, DownloadClientView),
  updateClient: (id: string, body: SaveDownloadClientBody) =>
    api.put(`/download-clients/${enc(id)}`, body, DownloadClientView),
  deleteClient: (id: string) => api.delete(`/download-clients/${enc(id)}`),
  testClient: (id: string) =>
    api.post(`/download-clients/${enc(id)}/test`, undefined, ClientTestResult),

  /** Current templates + a rendered sample. */
  naming: () => api.get('/organize/naming', NamingView),
  /** Render a sample for the given (unsaved) templates, for the live preview. */
  namingSample: (templates: NamingTemplatesView) =>
    api.post('/organize/sample', templates, SampleNames),
  saveNaming: (templates: NamingTemplatesView) => api.put('/organize/naming', templates),
  /** Non-destructive: library files that don't match the templates. */
  organizePreview: () => api.get('/organize/preview', OrganizePlan),
  /** Destructive: rename mismatched files to match the templates. */
  organizeApply: () => api.post('/organize/apply', undefined, OrganizeResult),
}));
