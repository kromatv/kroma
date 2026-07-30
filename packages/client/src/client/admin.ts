// Admin console: server identity, live sessions, metrics/storage, users,
// settings and watch stats.

import type {
  AdminOverview,
  AdminUsers,
  ElementProcessing,
  HistoryStats,
  JobDetail,
  JobLog,
  JobsView,
  LlmAdminConfig,
  LogsView,
  MetricsSnapshot,
  Notification,
  Permission,
  PipelineElements,
  PipelineTaskView,
  PipelineView,
  PlaybackSession,
  ServerInfo,
  SettingsView,
  StorageInfo,
  TopUser,
} from '../types';
import type { RequestContext } from './base';

const JSON_HEADERS = { 'content-type': 'application/json' };

export function adminServer(ctx: RequestContext): Promise<ServerInfo> {
  return ctx.json<ServerInfo>('/admin/server');
}

export function adminSessions(ctx: RequestContext): Promise<{ sessions: PlaybackSession[] }> {
  return ctx.json<{ sessions: PlaybackSession[] }>('/admin/sessions');
}

/** An empty `message` falls back to the client's localized default. */
export async function terminateSession(
  ctx: RequestContext,
  id: string,
  message?: string,
): Promise<void> {
  await ctx.json<void>(`/admin/sessions/${encodeURIComponent(id)}/stop`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ message: message ?? '' }),
  });
}

export function adminMetrics(ctx: RequestContext): Promise<MetricsSnapshot> {
  return ctx.json<MetricsSnapshot>('/admin/metrics');
}

export function adminStorage(ctx: RequestContext): Promise<StorageInfo> {
  return ctx.json<StorageInfo>('/admin/storage');
}

/** Wipes the transcode + image caches; requires `settings.manage`. */
export function clearCache(ctx: RequestContext): Promise<{ freedBytes: number }> {
  return ctx.json<{ freedBytes: number }>('/admin/cache/clear', { method: 'POST' });
}

/** Drops every resolved TMDB metadata so the next enrichment re-fetches from
 *  scratch; requires `settings.manage`. */
export function resetMetadata(ctx: RequestContext): Promise<{ items: number; shows: number }> {
  return ctx.json<{ items: number; shows: number }>('/admin/cache/reset-metadata', {
    method: 'POST',
  });
}

export interface AdminFsEntry {
  name: string;
  path: string;
}

export interface AdminFsList {
  path: string;
  parent: string | null;
  entries: AdminFsEntry[];
}

/** An empty/absent `path` returns the roots (NAS volumes, or `/` in dev). */
export function adminBrowseFolders(ctx: RequestContext, path?: string): Promise<AdminFsList> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : '';
  return ctx.json<AdminFsList>(`/admin/libraries/browse${qs}`);
}

/** Requires `users.manage`. */
export function adminUsers(ctx: RequestContext): Promise<AdminUsers> {
  return ctx.json<AdminUsers>('/admin/users');
}

export async function updateUser(
  ctx: RequestContext,
  id: string,
  patch: { permissions?: Permission[]; username?: string },
): Promise<void> {
  await ctx.json<void>(`/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export async function deleteUser(ctx: RequestContext, id: string): Promise<void> {
  await ctx.json<void>(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function adminSettings(ctx: RequestContext, view: string): Promise<SettingsView> {
  return ctx.json<SettingsView>(`/admin/settings?view=${encodeURIComponent(view)}`);
}

/** Resolves with the keys actually written. */
export function updateSettings(
  ctx: RequestContext,
  patch: Record<string, unknown>,
): Promise<{ updated: string[] }> {
  return ctx.json<{ updated: string[] }>('/admin/settings', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export interface BackupImportResult {
  imported: Record<string, number>;
  rescanStarted: boolean;
}

export interface BackupImportOptions {
  password?: string;
  reset?: boolean;
}

// Hex so an arbitrary password survives an HTTP header.
function hexUtf8(s: string): string {
  return Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** A `password` encrypts the archive (`.kroma`), else it is a plain `.zip`.
 *  Requires `settings.manage`. */
export function exportBackup(ctx: RequestContext, password?: string): Promise<Blob> {
  return ctx.blob(
    '/admin/backup/export',
    password ? { headers: { 'x-backup-password': hexUtf8(password) } } : undefined,
  );
}

/** Restores a `.zip`/`.kroma`/legacy `.json`, then triggers a re-scan so the
 *  catalogue regenerates with matching item IDs. */
export function importBackup(
  ctx: RequestContext,
  file: Blob,
  opts?: BackupImportOptions,
): Promise<BackupImportResult> {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (opts?.password) headers['x-backup-password'] = hexUtf8(opts.password);
  if (opts?.reset) headers['x-backup-reset'] = '1';
  return ctx.json<BackupImportResult>('/admin/backup/import', {
    method: 'POST',
    headers,
    body: file,
  });
}

export function topUsers(ctx: RequestContext, days = 7): Promise<{ users: TopUser[] }> {
  return ctx.json<{ users: TopUser[] }>(`/admin/stats/top-users?days=${days}`);
}

/** Weekly films-vs-TV watch buckets. */
export function playHistory(ctx: RequestContext, days = 28): Promise<HistoryStats> {
  return ctx.json<HistoryStats>(`/admin/stats/history?days=${days}`);
}

export function adminOverview(ctx: RequestContext): Promise<AdminOverview> {
  return ctx.json<AdminOverview>('/admin/stats/overview');
}

/** Newest last. `level` is a minimum severity, `source` is `core` or a module
 *  id, `q` is a case-insensitive substring. */
export function adminLogs(
  ctx: RequestContext,
  opts: { level?: string; source?: string; q?: string; limit?: number } = {},
): Promise<LogsView> {
  const params = new URLSearchParams();
  if (opts.level) params.set('level', opts.level);
  if (opts.source) params.set('source', opts.source);
  if (opts.q) params.set('q', opts.q);
  if (opts.limit) params.set('limit', String(opts.limit));
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return ctx.json<LogsView>(`/admin/logs${suffix}`);
}

export type NotificationTarget = 'me' | 'admins' | 'everyone';

/** Either a core `event` to sample or hand-written text; a `title` wins. */
export interface SendNotificationBody {
  event?: string;
  title?: string;
  body?: string;
  category?: Notification['category'];
  link?: string;
  imageUrl?: string;
  target?: NotificationTarget;
}

/** Rendered server-side so a preview cannot drift from what Send delivers. */
export function notificationSamples(ctx: RequestContext): Promise<{ events: Notification[] }> {
  return ctx.json<{ events: Notification[] }>('/admin/notifications/samples');
}

/** Sends a real notification through the normal pipeline, so `delivered` counts
 *  people actually reached - a muted category is not counted. */
export function sendNotification(
  ctx: RequestContext,
  body: SendNotificationBody,
): Promise<{ delivered: number }> {
  return ctx.json<{ delivered: number }>('/admin/notifications', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ target: 'me', ...body }),
  });
}

/** Returns the cached WebP's path in the same store avatars use, so every
 *  client already resolves it. */
export function uploadNotificationImage(
  ctx: RequestContext,
  file: Blob,
): Promise<{ imageUrl: string }> {
  return ctx.json<{ imageUrl: string }>('/admin/notifications/image', {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });
}

export function adminJobs(ctx: RequestContext): Promise<JobsView> {
  return ctx.json<JobsView>('/admin/jobs');
}

export function adminJob(ctx: RequestContext, key: string): Promise<JobDetail> {
  return ctx.json<JobDetail>(`/admin/jobs/${encodeURIComponent(key)}`);
}

export function runJob(ctx: RequestContext, key: string): Promise<{ runId: string }> {
  return ctx.json<{ runId: string }>(`/admin/jobs/${encodeURIComponent(key)}/run`, {
    method: 'POST',
  });
}

export function cancelJob(ctx: RequestContext, key: string): Promise<{ cancelled: boolean }> {
  return ctx.json<{ cancelled: boolean }>(`/admin/jobs/${encodeURIComponent(key)}/cancel`, {
    method: 'POST',
  });
}

/** A `null` schedule clears it. */
export async function updateJob(
  ctx: RequestContext,
  key: string,
  patch: { schedule?: string | null; enabled?: boolean },
): Promise<void> {
  await ctx.json<void>(`/admin/jobs/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export function jobRunLogs(ctx: RequestContext, runId: string): Promise<{ logs: JobLog[] }> {
  return ctx.json<{ logs: JobLog[] }>(`/admin/job-runs/${encodeURIComponent(runId)}/logs`);
}

export function adminPipeline(ctx: RequestContext): Promise<PipelineView> {
  return ctx.json<PipelineView>('/admin/pipeline');
}

/** Newest first. */
export function pipelineFailed(
  ctx: RequestContext,
  stage: string,
): Promise<{ tasks: PipelineTaskView[] }> {
  return ctx.json<{ tasks: PipelineTaskView[] }>(
    `/admin/pipeline/${encodeURIComponent(stage)}/failed`,
  );
}

export function runPipelineStage(ctx: RequestContext, stage: string): Promise<{ runId: string }> {
  return ctx.json<{ runId: string }>(`/admin/pipeline/${encodeURIComponent(stage)}/run`, {
    method: 'POST',
  });
}

export function cancelPipelineStage(
  ctx: RequestContext,
  stage: string,
): Promise<{ cancelled: boolean }> {
  return ctx.json<{ cancelled: boolean }>(`/admin/pipeline/${encodeURIComponent(stage)}/cancel`, {
    method: 'POST',
  });
}

/** Holds or releases every stage at once. */
export function pausePipeline(ctx: RequestContext, paused: boolean): Promise<{ paused: boolean }> {
  return ctx.json<{ paused: boolean }>('/admin/pipeline/pause', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ paused }),
  });
}

/** Resets a stage's failed tasks to pending. */
export function retryPipelineStage(
  ctx: RequestContext,
  stage: string,
): Promise<{ requeued: number }> {
  return ctx.json<{ requeued: number }>(`/admin/pipeline/${encodeURIComponent(stage)}/retry`, {
    method: 'POST',
  });
}

/** Puts every non-running task of a stage back to pending. */
export function reprocessPipelineStage(
  ctx: RequestContext,
  stage: string,
): Promise<{ requeued: number }> {
  return ctx.json<{ requeued: number }>(`/admin/pipeline/${encodeURIComponent(stage)}/reprocess`, {
    method: 'POST',
  });
}

export function retryPipelineTask(
  ctx: RequestContext,
  stage: string,
  subjectId: string,
): Promise<{ requeued: number }> {
  return ctx.json<{ requeued: number }>(`/admin/pipeline/${encodeURIComponent(stage)}/task/retry`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ subjectId }),
  });
}

/** Filtered, paginated elements with per-treatment status + full-catalog counts. */
export function pipelineElements(
  ctx: RequestContext,
  params: { status?: string; kind?: string; q?: string; page?: number; limit?: number } = {},
): Promise<PipelineElements> {
  const p = new URLSearchParams();
  if (params.status) p.set('status', params.status);
  if (params.kind) p.set('kind', params.kind);
  if (params.q) p.set('q', params.q);
  if (params.page != null) p.set('page', String(params.page));
  if (params.limit != null) p.set('limit', String(params.limit));
  const query = p.toString();
  const suffix = query ? `?${query}` : '';
  return ctx.json<PipelineElements>(`/admin/pipeline/elements${suffix}`);
}

export async function retryElementStage(
  ctx: RequestContext,
  kind: 'item' | 'show',
  id: string,
  stage: string,
): Promise<void> {
  await ctx.json<void>('/admin/pipeline/element/retry', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind, id, stage }),
  });
}

export function itemProcessing(ctx: RequestContext, id: string): Promise<ElementProcessing> {
  return ctx.json<ElementProcessing>(`/admin/pipeline/item/${encodeURIComponent(id)}`);
}

/** Aggregated across the series' episodes. */
export function showProcessing(ctx: RequestContext, id: string): Promise<ElementProcessing> {
  return ctx.json<ElementProcessing>(`/admin/pipeline/show/${encodeURIComponent(id)}`);
}

/** Clears the element's artifacts, requeues its tasks and kicks every stage. */
export function reprocessSubject(
  ctx: RequestContext,
  kind: 'item' | 'show',
  id: string,
): Promise<{ subjects: number; stages: string[] }> {
  return ctx.json<{ subjects: number; stages: string[] }>('/admin/pipeline/subject/reprocess', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind, id }),
  });
}

/** Blank fields fall back to the saved provider identified by `id`, notably a
 *  masked API key. */
export interface LlmProbe {
  id?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

/** API keys are never returned. */
export function adminLlm(ctx: RequestContext): Promise<LlmAdminConfig> {
  return ctx.json<LlmAdminConfig>('/admin/llm');
}

/** A blank/omitted `apiKey` keeps the stored secret. */
export interface LlmProviderInput {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  reasoning: boolean;
}

/** The default is identified by index, not id: a not-yet-saved provider has no
 *  id until the server assigns one. */
export interface LlmSave {
  enabled: boolean;
  defaultIndex: number;
  providers: LlmProviderInput[];
}

export function saveLlm(ctx: RequestContext, body: LlmSave): Promise<void> {
  return ctx.json<void>('/admin/llm', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export function llmModels(
  ctx: RequestContext,
  probe: LlmProbe,
): Promise<{ models: string[]; error?: string }> {
  return ctx.json('/admin/llm/models', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(probe),
  });
}

/** Never rejects on a bad endpoint: failures come back as `{ ok: false }`. */
export function testLlm(
  ctx: RequestContext,
  probe: LlmProbe,
): Promise<{ ok: boolean; message: string }> {
  return ctx.json('/admin/llm/test', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(probe),
  });
}

/** Live state of the supervised `cloudflared` child; never carries the token. */
export interface RemoteConnectorStatus {
  running: boolean;
  connecting: boolean;
  since?: string | null;
  lastError?: string | null;
  binaryFound: boolean;
  binaryVersion?: string | null;
  logs: string[];
}

export interface RemoteAccessView {
  enabled: boolean;
  url: string;
  hasToken: boolean;
  status: RemoteConnectorStatus;
}

/** A blank/omitted `token` keeps the stored one; an empty field never wipes it. */
export interface RemoteAccessSave {
  enabled: boolean;
  url: string;
  token?: string;
}

export function adminRemote(ctx: RequestContext): Promise<RemoteAccessView> {
  return ctx.json<RemoteAccessView>('/admin/remote');
}

/** Returns before the connector has reacted: the server reconciles `enabled`
 *  asynchronously, so the returned status may still be the old one. */
export function saveRemote(ctx: RequestContext, body: RemoteAccessSave): Promise<RemoteAccessView> {
  return ctx.json<RemoteAccessView>('/admin/remote', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
