import { describe, expect, it } from 'vitest';
import { KromaClient } from './api';
import { makeClient } from './api.fixture';

describe('URL builders (pure, no request)', () => {
  const c = new KromaClient({ baseUrl: 'http://kroma.test' });

  it('builds the offline download URL, distinguishing an omitted codec list from an empty one', () => {
    expect(c.downloadUrl('a b')).toBe('http://kroma.test/api/items/a%20b/download');
    expect(c.downloadUrl('i1', [], [])).toBe(
      'http://kroma.test/api/items/i1/download?copy=&video=',
    );
    expect(c.downloadUrl('i1', ['aac', 'ac3'])).toBe(
      'http://kroma.test/api/items/i1/download?copy=aac%2Cac3',
    );
  });

  it('build stream / hls / poster / subtitle / storyboard / logs URLs', () => {
    expect(c.streamUrl('a b')).toBe('http://kroma.test/api/items/a%20b/stream');
    expect(c.hlsMasterUrl('id')).toBe('http://kroma.test/api/items/id/hls/copy/0/0/index.m3u8');
    expect(c.hlsMasterUrl('id', true, 600.6, 2)).toBe(
      'http://kroma.test/api/items/id/hls/aac/601/2/index.m3u8',
    );
    expect(c.hlsMasterUrl('id', false, 0, 0, { copyCodecs: ['aac', 'eac3'] })).toBe(
      'http://kroma.test/api/items/id/hls/copy/0/0/index.m3u8?copy=aac%2Ceac3',
    );
    expect(c.hlsMasterUrl('id', false, 0, 0, { copyCodecs: ['aac'], videoCodecs: ['h264'] })).toBe(
      'http://kroma.test/api/items/id/hls/copy/0/0/index.m3u8?copy=aac&video=h264',
    );
    expect(c.posterUrl('id')).toBe('http://kroma.test/api/items/id/poster');
    expect(c.showPosterUrl('s1')).toBe('http://kroma.test/api/shows/s1/poster');
    expect(c.subtitleUrl('id', 3)).toBe('http://kroma.test/api/items/id/subtitles/3.vtt');
    expect(c.storyboardUrl('id')).toBe('http://kroma.test/api/items/id/storyboard');
    expect(c.logsUrl()).toBe('http://kroma.test/api/logs?tail=200');
    expect(c.logsUrl(50)).toBe('http://kroma.test/api/logs?tail=50');
  });

  it('resolve art / poster / backdrop / theme helpers', () => {
    expect(c.resolveArt('/api/images/x.webp')).toBe('http://kroma.test/api/images/x.webp');
    expect(c.resolveArt('https://cdn/x.jpg')).toBe('https://cdn/x.jpg');
    expect(c.resolveArt(null)).toBeNull();
    expect(c.posterFor({ id: 'i1', metadata: { posterUrl: '/api/p.webp' } as never })).toBe(
      'http://kroma.test/api/p.webp',
    );
    expect(c.posterFor({ id: 'i2', metadata: null })).toBe('http://kroma.test/api/items/i2/poster');
    expect(c.showPosterFor({ id: 's1', metadata: null } as never)).toBe(
      'http://kroma.test/api/shows/s1/poster',
    );
    expect(c.backdropFor({ metadata: { backdropUrl: '/api/b.webp' } as never })).toBe(
      'http://kroma.test/api/b.webp',
    );
    expect(c.backdropFor({ metadata: null })).toBeNull();
    expect(c.themeFor({ metadata: { themeUrl: '/api/t.mp3' } as never })).toBe(
      'http://kroma.test/api/t.mp3',
    );
    expect(c.themeFor({ metadata: null })).toBeNull();
  });
});

describe('delegating methods issue the expected request', () => {
  // Exact path + method assertions for the domains whose paths this test owns.
  const known: Array<[string, (c: KromaClient) => unknown, string, string]> = [
    ['health', (c) => c.health(), 'GET', '/health'],
    ['splash', (c) => c.splash(), 'GET', '/splash'],
    ['modules', (c) => c.modules(), 'GET', '/modules'],
    ['libraries', (c) => c.libraries(), 'GET', '/libraries'],
    ['items', (c) => c.items(), 'GET', '/items'],
    ['items(lib)', (c) => c.items('lib1'), 'GET', '/items?library=lib1'],
    ['movies', (c) => c.movies(), 'GET', '/movies'],
    ['shows', (c) => c.shows(), 'GET', '/shows'],
    ['show', (c) => c.show('s1'), 'GET', '/shows/s1'],
    ['item', (c) => c.item('i1'), 'GET', '/items/i1'],
    ['similar', (c) => c.similar('i1'), 'GET', '/items/i1/similar'],
    ['themed', (c) => c.themed('q x'), 'GET', '/themed?q=q%20x'],
    ['home', (c) => c.home(), 'GET', '/home'],
    ['aiSuggest', (c) => c.aiSuggest('i1'), 'GET', '/items/i1/ai-suggest'],
    ['search', (c) => c.search('q'), 'GET', '/search?q=q'],
    ['personCredits', (c) => c.personCredits('n'), 'GET', '/people?name=n'],
    ['scan', (c) => c.scan(), 'POST', '/scan'],
    ['status', (c) => c.status(), 'GET', '/status'],
    ['register', (c) => c.register('e', 'u', 'p'), 'POST', '/auth/register'],
    ['login', (c) => c.login('id', 'p'), 'POST', '/auth/login'],
    ['exchangeToken', (c) => c.exchangeToken('at'), 'POST', '/auth/token'],
    ['relock', (c) => c.relock('at'), 'POST', '/auth/relock'],
    ['logout', (c) => c.logout(), 'POST', '/auth/logout'],
    ['me', (c) => c.me(), 'GET', '/auth/me'],
    ['updateAccount', (c) => c.updateAccount({ username: 'x' }), 'PATCH', '/auth/me'],
    ['authConfig', (c) => c.authConfig(), 'GET', '/auth/config'],
    ['users', (c) => c.users(), 'GET', '/users'],
    ['listSessions', (c) => c.listSessions(), 'GET', '/auth/me/sessions'],
    ['revokeSession', (c) => c.revokeSession('s1'), 'DELETE', '/auth/me/sessions/s1'],
    ['invites', (c) => c.invites(), 'GET', '/invites'],
    ['checkInvite', (c) => c.checkInvite('t'), 'GET', '/invites/t'],
    ['revokeInvite', (c) => c.revokeInvite('t'), 'DELETE', '/invites/t'],
    ['quickConnectPoll', (c) => c.quickConnectPoll('s'), 'GET', '/auth/quickconnect/poll'],
    ['adminLibraries', (c) => c.adminLibraries(), 'GET', '/admin/libraries'],
    [
      'createLibrary',
      (c) => c.createLibrary({ name: 'n', folders: [] }),
      'POST',
      '/admin/libraries',
    ],
    ['updateLibrary', (c) => c.updateLibrary('x', {}), 'PATCH', '/admin/libraries/x'],
    ['deleteLibrary', (c) => c.deleteLibrary('x'), 'DELETE', '/admin/libraries/x'],
    ['scanLibrary', (c) => c.scanLibrary('x'), 'POST', '/admin/libraries/x/scan'],
  ];

  it.each(known)('%s -> %s %s', async (_name, call, method, path) => {
    const { client, calls } = makeClient();
    await Promise.resolve(call(client)).catch(() => undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe(method);
    expect(calls[0]?.url).toBe(`http://kroma.test/api${path}`);
  });

  // The remaining delegates: assert only that exactly one request is issued (the
  // per-domain paths/methods are covered by their own client/*.test.ts). This
  // exercises every facade line without duplicating those assertions.
  const others: Array<[string, (c: KromaClient) => unknown]> = [
    ['downloadedSubtitles', (c) => c.downloadedSubtitles('i1')],
    ['subtitleCapabilities', (c) => c.subtitleCapabilities('i1')],
    ['generateSubtitle', (c) => c.generateSubtitle('i1', {} as never)],
    ['subtitleGenerations', (c) => c.subtitleGenerations('i1')],
    ['cancelGeneration', (c) => c.cancelGeneration('i1', 'g1')],
    ['deleteSubtitle', (c) => c.deleteSubtitle('i1', 'd1')],
    ['createInvite', (c) => c.createInvite()],
    ['updateLanguage', (c) => c.updateLanguage('fr')],
    ['changePassword', (c) => c.changePassword('a', 'bbbb')],
    ['passkeyRegisterStart', (c) => c.passkeyRegisterStart()],
    [
      'passkeyRegisterFinish',
      (c) => c.passkeyRegisterFinish({ ceremonyId: 'c', name: 'n', credential: {} as never }),
    ],
    ['listPasskeys', (c) => c.listPasskeys()],
    ['deletePasskey', (c) => c.deletePasskey('p1')],
    ['passkeyAuthStart', (c) => c.passkeyAuthStart()],
    ['passkeyAuthFinish', (c) => c.passkeyAuthFinish({ ceremonyId: 'c', credential: {} as never })],
    ['pinVerify', (c) => c.pinVerify('1234')],
    ['setPin', (c) => c.setPin('1234')],
    ['clearPin', (c) => c.clearPin('1234')],
    ['uploadAvatar', (c) => c.uploadAvatar(new Blob(['x']))],
    ['quickConnectInitiate', (c) => c.quickConnectInitiate()],
    ['quickConnectAuthorize', (c) => c.quickConnectAuthorize('code')],
    [
      'announceHandoff',
      (c) => c.announceHandoff({ deviceId: 'tv-1', name: 'Salon', platform: 'TV' }),
    ],
    ['handoffLeave', (c) => c.handoffLeave('s3cr3t')],
    ['handoffPoll', (c) => c.handoffPoll('s3cr3t')],
    ['handoffDevices', (c) => c.handoffDevices()],
    ['handoffGrant', (c) => c.handoffGrant('a1b2c3')],
    ['handoffGrant with a check string', (c) => c.handoffGrant('a1b2c3', { check: 'K7QMR' })],
    ['progress', (c) => c.progress()],
    ['itemProgress', (c) => c.itemProgress('i1')],
    ['continueWatching', (c) => c.continueWatching()],
    ['upNext', (c) => c.upNext('s1')],
    ['nextEpisode', (c) => c.nextEpisode('i1')],
    ['followingEpisodes', (c) => c.followingEpisodes('i1')],
    ['forYou', (c) => c.forYou()],
    ['saveProgress', (c) => c.saveProgress('i1', 1000)],
    ['deleteProgress', (c) => c.deleteProgress('i1')],
    ['watched', (c) => c.watched()],
    ['markWatched', (c) => c.markWatched('i1')],
    ['unmarkWatched', (c) => c.unmarkWatched('i1')],
    ['myList', (c) => c.myList()],
    ['addToList', (c) => c.addToList('i1')],
    ['removeFromList', (c) => c.removeFromList('i1')],
    ['pingPlayback', (c) => c.pingPlayback({ sessionId: 's', itemId: 'i', positionMs: 0 })],
    ['stopPlayback', (c) => c.stopPlayback('sess')],
    ['discoverSearch', (c) => c.discoverSearch('q')],
    ['discoverTrending', (c) => c.discoverTrending()],
    ['discoverDetail', (c) => c.discoverDetail('movie', 1)],
    ['listRequests', (c) => c.listRequests()],
    ['getCalendar', (c) => c.getCalendar()],
    ['getMissing', (c) => c.getMissing()],
    ['searchAllMissing', (c) => c.searchAllMissing()],
    ['autoSearchRequest', (c) => c.autoSearchRequest('r1')],
    ['createRequest', (c) => c.createRequest({} as never)],
    ['deleteRequest', (c) => c.deleteRequest('r1')],
    ['approveRequest', (c) => c.approveRequest('r1')],
    ['denyRequest', (c) => c.denyRequest('r1')],
    ['searchReleases', (c) => c.searchReleases('r1')],
    ['grabRelease', (c) => c.grabRelease('r1', {} as never)],
    ['adminBrowseFolders', (c) => c.adminBrowseFolders()],
    ['adminServer', (c) => c.adminServer()],
    ['adminSessions', (c) => c.adminSessions()],
    ['terminateSession', (c) => c.terminateSession('x')],
    ['adminMetrics', (c) => c.adminMetrics()],
    ['adminStorage', (c) => c.adminStorage()],
    ['clearCache', (c) => c.clearCache()],
    ['resetMetadata', (c) => c.resetMetadata()],
    ['adminUsers', (c) => c.adminUsers()],
    ['updateUser', (c) => c.updateUser('x', {})],
    ['deleteUser', (c) => c.deleteUser('x')],
    ['adminSettings', (c) => c.adminSettings('view')],
    ['updateSettings', (c) => c.updateSettings({})],
    ['exportBackup', (c) => c.exportBackup()],
    ['importBackup', (c) => c.importBackup(new Blob(['x']))],
    ['topUsers', (c) => c.topUsers()],
    ['playHistory', (c) => c.playHistory()],
    ['adminOverview', (c) => c.adminOverview()],
    ['adminLogs', (c) => c.adminLogs()],
    ['adminJobs', (c) => c.adminJobs()],
    ['adminJob', (c) => c.adminJob('k')],
    ['runJob', (c) => c.runJob('k')],
    ['cancelJob', (c) => c.cancelJob('k')],
    ['updateJob', (c) => c.updateJob('k', {})],
    ['jobRunLogs', (c) => c.jobRunLogs('r1')],
    ['adminPipeline', (c) => c.adminPipeline()],
    ['pipelineFailed', (c) => c.pipelineFailed('s')],
    ['runPipelineStage', (c) => c.runPipelineStage('s')],
    ['cancelPipelineStage', (c) => c.cancelPipelineStage('s')],
    ['pausePipeline', (c) => c.pausePipeline(true)],
    ['retryPipelineStage', (c) => c.retryPipelineStage('s')],
    ['reprocessPipelineStage', (c) => c.reprocessPipelineStage('s')],
    ['retryPipelineTask', (c) => c.retryPipelineTask('s', 'sub')],
    ['reprocessSubject', (c) => c.reprocessSubject('item', 'i1')],
    ['itemProcessing', (c) => c.itemProcessing('i1')],
    ['pipelineElements', (c) => c.pipelineElements()],
    ['retryElementStage', (c) => c.retryElementStage('item', 'i1', 's')],
    ['showProcessing', (c) => c.showProcessing('s1')],
    ['adminLlm', (c) => c.adminLlm()],
    ['saveLlm', (c) => c.saveLlm({} as never)],
    ['llmModels', (c) => c.llmModels({} as never)],
    ['testLlm', (c) => c.testLlm({} as never)],
    ['logs', (c) => c.logs()],
    ['storyboard', (c) => c.storyboard('i1')],
    ['featured', (c) => c.featured()],
    ['personDetails', (c) => c.personDetails('Denis Villeneuve')],
    ['announceCast', (c) => c.announceCast({ receiverId: 'r1' } as never)],
    ['unregisterCast', (c) => c.unregisterCast('r1')],
    ['castReceivers', (c) => c.castReceivers()],
    ['sendCastCommand', (c) => c.sendCastCommand('r1', { type: 'pause' } as never)],
    ['matchCandidates', (c) => c.matchCandidates('movie', 'i1')],
    ['setMatch', (c) => c.setMatch('show', 's1', 42)],
    ['createReport', (c) => c.createReport({} as never)],
    ['listMyReports', (c) => c.listMyReports()],
    ['adminReports', (c) => c.adminReports({ status: 'open' })],
    ['resolveReport', (c) => c.resolveReport('r1')],
    ['dismissReport', (c) => c.dismissReport('r1')],
    ['reopenReport', (c) => c.reopenReport('r1')],
    ['deleteReport', (c) => c.deleteReport('r1')],
    ['listNotifications', (c) => c.listNotifications()],
    ['markNotificationsRead', (c) => c.markNotificationsRead(['n1'])],
    ['markNotificationsUnread', (c) => c.markNotificationsUnread(['n1'])],
    ['markAllNotificationsRead', (c) => c.markAllNotificationsRead()],
    ['deleteNotification', (c) => c.deleteNotification('n1')],
    ['getNotificationPrefs', (c) => c.getNotificationPrefs()],
    ['setNotificationPrefs', (c) => c.setNotificationPrefs({} as never)],
    ['runNotificationAction', (c) => c.runNotificationAction({ href: '/api/requests/r1/approve' })],
    ['pushKey', (c) => c.pushKey()],
    ['subscribePush', (c) => c.subscribePush({} as never)],
    ['unsubscribePush', (c) => c.unsubscribePush('https://push/e')],
    ['testPush', (c) => c.testPush()],
    ['notificationSamples', (c) => c.notificationSamples()],
    ['sendNotification', (c) => c.sendNotification({ title: 'hi' })],
    ['uploadNotificationImage', (c) => c.uploadNotificationImage(new Blob(['x']))],
    ['listNotificationImages', (c) => c.listNotificationImages()],
  ];

  it.each(others)('%s issues exactly one request', async (_name, call) => {
    const { client, calls } = makeClient();
    await Promise.resolve(call(client)).catch(() => undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.startsWith('http://kroma.test/')).toBe(true);
  });
});
