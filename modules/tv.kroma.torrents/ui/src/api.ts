// This module's admin API: downloads, the download clients behind them, and
// the naming/organize tools. `moduleApiHook` binds it to the module the host is
// rendering, so the id is never repeated here.

import { moduleApiHook } from '@kroma/module-sdk';
import type {
  ClientTestResult,
  DownloadClientsView,
  DownloadClientView,
  DownloadsView,
  NamingTemplatesView,
  NamingView,
  OrganizePlan,
  OrganizeResult,
  SampleNames,
  SaveDownloadClientBody,
} from './schemas';

const enc = encodeURIComponent;

export const useTorrentsApi = moduleApiHook((api) => ({
  downloads: () => api.get<DownloadsView>('/downloads'),
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
