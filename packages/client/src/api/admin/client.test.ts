import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { UserId } from '../accounts';
import { PlaybackSessionId } from '../playback';

const user = UserId.parse('u1');

describe('the admin console endpoints', () => {
  it.each<Endpoint>([
    { name: 'server', call: (c) => c.admin.server(), method: 'GET', path: '/admin/server' },
    { name: 'status', call: (c) => c.admin.status(), method: 'GET', path: '/status' },
    { name: 'sessions', call: (c) => c.admin.sessions(), method: 'GET', path: '/admin/sessions' },
    {
      name: 'terminateSession falls back to no message at all',
      call: (c) => c.admin.terminateSession(PlaybackSessionId.parse('s 1')),
      method: 'POST',
      path: '/admin/sessions/s%201/stop',
      body: { message: '' },
    },
    {
      name: 'terminateSession with a word for the viewer',
      call: (c) => c.admin.terminateSession(PlaybackSessionId.parse('s1'), 'Maintenance'),
      method: 'POST',
      path: '/admin/sessions/s1/stop',
      body: { message: 'Maintenance' },
    },
    {
      name: 'metrics',
      call: (c) => c.admin.metrics('7d'),
      method: 'GET',
      path: '/admin/metrics?range=7d',
    },
    {
      name: 'metrics defaults to the live window',
      call: (c) => c.admin.metrics(),
      method: 'GET',
      path: '/admin/metrics?range=live',
    },
    {
      name: 'transcodes',
      call: (c) => c.admin.transcodes(),
      method: 'GET',
      path: '/admin/transcodes',
    },
    { name: 'storage', call: (c) => c.admin.storage(), method: 'GET', path: '/admin/storage' },
    {
      name: 'clearCache',
      call: (c) => c.admin.clearCache(),
      method: 'POST',
      path: '/admin/cache/clear',
    },
    {
      name: 'resetMetadata',
      call: (c) => c.admin.resetMetadata(),
      method: 'POST',
      path: '/admin/cache/reset-metadata',
    },
    { name: 'users', call: (c) => c.admin.users(), method: 'GET', path: '/admin/users' },
    {
      name: 'updateUser',
      call: (c) => c.admin.updateUser(user, { permissions: ['playback'] }),
      method: 'PATCH',
      path: '/admin/users/u1',
      body: { permissions: ['playback'] },
    },
    {
      name: 'deleteUser',
      call: (c) => c.admin.deleteUser(user),
      method: 'DELETE',
      path: '/admin/users/u1',
    },
    {
      name: 'resetUser',
      call: (c) => c.admin.resetUser(user),
      method: 'POST',
      path: '/admin/users/u1/reset',
    },
    {
      name: 'clearUserPin',
      call: (c) => c.admin.clearUserPin(user),
      method: 'DELETE',
      path: '/admin/users/u1/pin',
    },
    {
      name: 'sendEmailVerification',
      call: (c) => c.admin.sendEmailVerification(user),
      method: 'POST',
      path: '/admin/users/u1/email-verification',
    },
    {
      name: 'settings',
      call: (c) => c.admin.settings('general'),
      method: 'GET',
      path: '/admin/settings?view=general',
    },
    {
      name: 'updateSettings',
      call: (c) => c.admin.updateSettings({ serverName: 'NAS' }),
      method: 'PUT',
      path: '/admin/settings',
      body: { serverName: 'NAS' },
    },
    {
      name: 'testSmtp',
      call: (c) => c.admin.testSmtp(),
      method: 'POST',
      path: '/admin/settings/smtp-test',
    },
    {
      name: 'overview',
      call: (c) => c.admin.overview(),
      method: 'GET',
      path: '/admin/stats/overview',
    },
    {
      name: 'topUsers',
      call: (c) => c.admin.topUsers(),
      method: 'GET',
      path: '/admin/stats/top-users?days=7',
    },
    {
      name: 'mostWatched',
      call: (c) => c.admin.mostWatched({ user }),
      method: 'GET',
      path: '/admin/stats/most-watched?days=30&user=u1',
    },
    {
      name: 'mostWatched over the default window',
      call: (c) => c.admin.mostWatched(),
      method: 'GET',
      path: '/admin/stats/most-watched?days=30',
    },
    {
      name: 'history from a bare day count',
      call: (c) => c.admin.history(14),
      method: 'GET',
      path: '/admin/stats/history?days=14',
    },
    {
      name: 'history narrowed by kind and viewer',
      call: (c) => c.admin.history({ kind: 'movie', user }),
      method: 'GET',
      path: '/admin/stats/history?kind=movie&user=u1&days=28',
    },
    {
      name: 'history over the default window',
      call: (c) => c.admin.history(),
      method: 'GET',
      path: '/admin/stats/history?days=28',
    },
    {
      name: 'plays',
      call: (c) => c.admin.plays({ limit: 50 }),
      method: 'GET',
      path: '/admin/stats/plays?limit=50&days=30',
    },
    {
      name: 'plays unfiltered',
      call: (c) => c.admin.plays(),
      method: 'GET',
      path: '/admin/stats/plays?days=30',
    },
    {
      name: 'logs',
      call: (c) => c.admin.logs({ level: 'warn' }),
      method: 'GET',
      path: '/admin/logs?level=warn',
    },
    { name: 'logs unfiltered', call: (c) => c.admin.logs(), method: 'GET', path: '/admin/logs' },
  ])('$name', checkEndpoint);
});
