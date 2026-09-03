import { z } from 'zod';
import type { RequestContext } from '../../core/http';
import { ResetCreated, type UserId, VerificationCreated } from '../accounts';
import { ServerInfo } from '../media';
import type { PlaybackSessionId } from '../playback';
import { backupApi } from './backup';
import { LogsView } from './logs';
import { type MetricRange, MetricsSnapshot, StorageInfo, Transcodes } from './metrics';
import { adminNotificationsApi } from './notifications';
import { SettingsView } from './settings';
import { Activity, HistoryStats, MostWatched, PlaybackSession, PlaysPage, TopUser } from './stats';
import { AdminOverview, type AdminUserPatch, AdminUsers } from './users';

const Sessions = z.object({ sessions: z.array(PlaybackSession) });
const Freed = z.object({ freedBytes: z.number() });
const MetadataReset = z.object({ items: z.number(), shows: z.number() });
const SettingsWritten = z.object({ updated: z.array(z.string()) });
const SmtpProbe = z.object({ sentTo: z.string() });
const Viewers = z.object({ users: z.array(TopUser) });

interface HistoryWindow {
  days?: number;
  kind?: string;
  user?: UserId;
}

/** The admin console: server identity, live sessions, metrics and storage,
 * accounts, settings, and the watch statistics behind the dashboard. */
export default function adminApi(ctx: RequestContext) {
  return {
    backup: backupApi(ctx),
    notifications: adminNotificationsApi(ctx),

    server: () => ctx.get('/admin/server', ServerInfo),

    /** Live scan / enrichment status snapshot. */
    status: () => ctx.get('/status', Activity),

    sessions: () => ctx.get('/admin/sessions', Sessions),

    /** An empty `message` falls back to the client's localized default. */
    terminateSession: (id: PlaybackSessionId, message?: string) =>
      ctx.post('/admin/sessions/:id/stop', { params: { id }, body: { message: message ?? '' } }),

    /** `range` defaults to the live rolling window; anything else is read from
     * the samples the server has persisted. */
    metrics: (range: MetricRange = 'live') =>
      ctx.get('/admin/metrics', MetricsSnapshot, { query: { range } }),

    /** Every remux running now, the silicon they run on, and whether each is
     * keeping ahead of the player. */
    transcodes: () => ctx.get('/admin/transcodes', Transcodes),

    storage: () => ctx.get('/admin/storage', StorageInfo),

    /** Wipes the transcode + image caches; requires `settings.manage`. */
    clearCache: () => ctx.post('/admin/cache/clear', Freed),

    /** Drops every resolved TMDB metadata so the next enrichment re-fetches from
     * scratch; requires `settings.manage`. */
    resetMetadata: () => ctx.post('/admin/cache/reset-metadata', MetadataReset),

    /** Requires `users.manage`. */
    users: () => ctx.get('/admin/users', AdminUsers),

    updateUser: (id: UserId, patch: AdminUserPatch) =>
      ctx.patch('/admin/users/:id', { params: { id }, body: patch }),

    deleteUser: (id: UserId) => ctx.delete('/admin/users/:id', { params: { id } }),

    /** Mint a credential reset (requires `users.manage`). The returned `code` is
     * the one-time code the owner reads to the user; it is never stored in clear. */
    resetUser: (id: UserId) => ctx.post('/admin/users/:id/reset', ResetCreated, { params: { id } }),

    /** Clear a user's profile PIN (requires `users.manage`). Remembered devices
     * re-lock and ask for the account credential on the next switch-in. */
    clearUserPin: (id: UserId) => ctx.delete('/admin/users/:id/pin', { params: { id } }),

    /** Mint an email-verification link for the account's current address and try
     * to deliver it (requires `users.manage`). No code: reaching the mailbox is
     * itself the proof. */
    sendEmailVerification: (id: UserId) =>
      ctx.post('/admin/users/:id/email-verification', VerificationCreated, { params: { id } }),

    settings: (view: string) => ctx.get('/admin/settings', SettingsView, { query: { view } }),

    /** Resolves with the keys actually written. */
    updateSettings: (patch: Record<string, unknown>) =>
      ctx.put('/admin/settings', SettingsWritten, { body: patch }),

    /** Sends a short probe to the caller's own address with the saved SMTP
     * settings; resolves with the address it went to. */
    testSmtp: () => ctx.post('/admin/settings/smtp-test', SmtpProbe),

    overview: () => ctx.get('/admin/stats/overview', AdminOverview),

    topUsers: (days = 7) => ctx.get('/admin/stats/top-users', Viewers, { query: { days } }),

    /** The titles played most over a window, one column per kind of media. */
    mostWatched: (opts: { days?: number; user?: UserId } = {}) =>
      ctx.get('/admin/stats/most-watched', MostWatched, {
        query: { days: opts.days ?? 30, user: opts.user },
      }),

    /** Time watched per bucket over a window, stacked by kind. `kind` and `user`
     * narrow it the way the dashboard panel's two other filters do; a bare number
     * is the window in days. */
    history: (opts: number | HistoryWindow = 28) => {
      const window = typeof opts === 'number' ? { days: opts } : opts;
      return ctx.get('/admin/stats/history', HistoryStats, {
        query: { ...window, days: window.days ?? 28 },
      });
    },

    /** The watch log, newest first: who watched what, when, and on which device.
     * `sort` is a column name plus `:asc` or `:desc`. */
    plays: (
      opts: {
        days?: number;
        user?: UserId;
        library?: string;
        /** An item or show id, for one title's own history. */
        item?: string;
        sort?: string;
        limit?: number;
        offset?: number;
      } = {},
    ) => ctx.get('/admin/stats/plays', PlaysPage, { query: { ...opts, days: opts.days ?? 30 } }),

    /** Newest last. `level` is a minimum severity, `source` is `core` or a
     * module id, `q` is a case-insensitive substring. */
    logs: (opts: { level?: string; source?: string; q?: string; limit?: number } = {}) =>
      ctx.get('/admin/logs', LogsView, { query: opts }),
  };
}

declare module '../../core/client' {
  interface Domains {
    admin: ReturnType<typeof adminApi>;
  }
}
