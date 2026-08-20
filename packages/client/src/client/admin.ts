// Admin console: server identity, live sessions, metrics/storage, users,
// settings and watch stats.

import { NotificationImages } from '../schemas';
import type {
  AdminOverview,
  AdminUsers,
  HistoryStats,
  JobDetail,
  JobLog,
  JobsView,
  LogsView,
  MetricsSnapshot,
  Notification,
  Permission,
  PlaybackSession,
  ServerInfo,
  SettingsView,
  StorageInfo,
  TopUser,
} from '../types';
import { JSON_HEADERS, type RequestContext } from './base';

export * from './admin-llm';
export * from './admin-pipeline';

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

/** Images previously uploaded for notifications, newest first. */
export async function listNotificationImages(ctx: RequestContext): Promise<NotificationImages> {
  return NotificationImages.parse(await ctx.json('/admin/notifications/images'));
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
