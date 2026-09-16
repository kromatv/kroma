import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { CeremonyId, InviteToken, PasskeyId, SessionId } from './ids';

const ceremonyId = CeremonyId.parse('cer1');
const credential = { id: 'cred', type: 'public-key' };

describe('the accounts endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'register',
      call: (c) => c.accounts.register('max@kroma.tv', 'max', 'pw', InviteToken.parse('inv1')),
      method: 'POST',
      path: '/auth/register',
      auth: 'public',
      body: { email: 'max@kroma.tv', username: 'max', password: 'pw', inviteToken: 'inv1' },
    },
    {
      name: 'login',
      call: (c) => c.accounts.login('max', 'pw'),
      method: 'POST',
      path: '/auth/login',
      auth: 'public',
      body: { email: 'max', password: 'pw' },
    },
    {
      name: 'exchangeToken with the PIN a locked profile demands',
      call: (c) => c.accounts.exchangeToken('access', '1234'),
      method: 'POST',
      path: '/auth/token',
      auth: 'public',
      body: { accessToken: 'access', pin: '1234' },
    },
    {
      name: 'relock',
      call: (c) => c.accounts.relock('access'),
      method: 'POST',
      path: '/auth/relock',
      auth: 'public',
      body: { accessToken: 'access' },
    },
    {
      name: 'logout',
      call: (c) => c.accounts.logout('access'),
      method: 'POST',
      path: '/auth/logout',
      body: { accessToken: 'access' },
    },
    { name: 'me', call: (c) => c.accounts.me(), method: 'GET', path: '/auth/me' },
    {
      name: 'update',
      call: (c) => c.accounts.update({ username: 'max' }),
      method: 'PATCH',
      path: '/auth/me',
      body: { username: 'max' },
    },
    {
      name: 'updateLanguage clearing the preference',
      call: (c) => c.accounts.updateLanguage(null),
      method: 'PATCH',
      path: '/auth/me',
      body: { language: null },
    },
    {
      name: 'changePassword',
      call: (c) => c.accounts.changePassword('old', 'new'),
      method: 'PATCH',
      path: '/auth/me/password',
      body: { current: 'old', next: 'new' },
    },
    {
      name: 'config',
      call: (c) => c.accounts.config(),
      method: 'GET',
      path: '/auth/config',
      auth: 'public',
    },
    { name: 'users', call: (c) => c.accounts.users(), method: 'GET', path: '/users' },
    {
      name: 'verifyPin',
      call: (c) => c.accounts.verifyPin('1234'),
      method: 'POST',
      path: '/auth/pin/verify',
      body: { pin: '1234' },
    },
    {
      name: 'setPin rotating an existing one',
      call: (c) => c.accounts.setPin('5678', '1234'),
      method: 'PATCH',
      path: '/auth/me/pin',
      body: { pin: '5678', current: '1234' },
    },
    {
      name: 'clearPin',
      call: (c) => c.accounts.clearPin('1234'),
      method: 'DELETE',
      path: '/auth/me/pin',
      body: { current: '1234' },
    },
    {
      name: 'uploadAvatar',
      call: (c) => c.accounts.uploadAvatar(new Blob(['x'], { type: 'image/png' })),
      method: 'POST',
      path: '/users/avatar',
    },
    {
      name: 'sessions',
      call: (c) => c.accounts.sessions(),
      method: 'GET',
      path: '/auth/me/sessions',
    },
    {
      name: 'revokeSession',
      call: (c) => c.accounts.revokeSession(SessionId.parse('d 1')),
      method: 'DELETE',
      path: '/auth/me/sessions/d%201',
    },
    {
      name: 'checkReset',
      call: (c) => c.accounts.checkReset('tok/1'),
      method: 'GET',
      path: '/auth/reset/tok%2F1',
    },
    {
      name: 'redeemReset',
      call: (c) => c.accounts.redeemReset('tok', '123456', 'pw'),
      method: 'POST',
      path: '/auth/reset',
      body: { token: 'tok', code: '123456', password: 'pw' },
    },
    {
      name: 'requestReset',
      call: (c) => c.accounts.requestReset('max'),
      method: 'POST',
      path: '/auth/reset-request',
      body: { identifier: 'max' },
    },
    {
      name: 'checkEmailVerification',
      call: (c) => c.accounts.checkEmailVerification('tok 1'),
      method: 'GET',
      path: '/auth/verify-email/tok%201',
    },
    {
      name: 'confirmEmailVerification',
      call: (c) => c.accounts.confirmEmailVerification('tok'),
      method: 'POST',
      path: '/auth/verify-email',
      body: { token: 'tok' },
    },
    { name: 'invites', call: (c) => c.accounts.invites(), method: 'GET', path: '/invites' },
    {
      name: 'createInvite',
      call: (c) => c.accounts.createInvite({ permissions: ['playback'], expiresInDays: 7 }),
      method: 'POST',
      path: '/invites',
      body: { permissions: ['playback'], expiresInDays: 7 },
    },
    {
      name: 'createInvite with nothing to say',
      call: (c) => c.accounts.createInvite(),
      method: 'POST',
      path: '/invites',
      body: {},
    },
    {
      name: 'checkInvite',
      call: (c) => c.accounts.checkInvite(InviteToken.parse('t/1')),
      method: 'GET',
      path: '/invites/t%2F1',
    },
    {
      name: 'revokeInvite',
      call: (c) => c.accounts.revokeInvite(InviteToken.parse('t 1')),
      method: 'DELETE',
      path: '/invites/t%201',
    },
  ])('$name', checkEndpoint);
});

describe('the passkey ceremonies', () => {
  it.each<Endpoint>([
    {
      name: 'list',
      call: (c) => c.accounts.passkeys.list(),
      method: 'GET',
      path: '/auth/me/passkeys',
    },
    {
      name: 'delete',
      call: (c) => c.accounts.passkeys.delete(PasskeyId.parse('p 1')),
      method: 'DELETE',
      path: '/auth/me/passkeys/p%201',
    },
    {
      name: 'registerStart',
      call: (c) => c.accounts.passkeys.registerStart(),
      method: 'POST',
      path: '/auth/me/passkeys/register/start',
    },
    {
      name: 'registerFinish',
      call: (c) => c.accounts.passkeys.registerFinish({ ceremonyId, name: 'MacBook', credential }),
      method: 'POST',
      path: '/auth/me/passkeys/register/finish',
      body: { ceremonyId: 'cer1', name: 'MacBook', credential },
    },
    {
      name: 'authStart',
      call: (c) => c.accounts.passkeys.authStart(),
      method: 'POST',
      path: '/auth/passkeys/authenticate/start',
    },
    {
      name: 'authFinish',
      call: (c) => c.accounts.passkeys.authFinish({ ceremonyId, credential }),
      method: 'POST',
      path: '/auth/passkeys/authenticate/finish',
      body: { ceremonyId: 'cer1', credential },
    },
  ])('$name', checkEndpoint);
});

describe('the quick-connect endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'initiate, rotating an expiring code',
      call: (c) => c.accounts.quickConnect.initiate('old'),
      method: 'POST',
      path: '/auth/quickconnect/initiate',
      auth: 'public',
      body: { prevSecret: 'old' },
    },
    {
      name: 'authorize',
      call: (c) => c.accounts.quickConnect.authorize('123456'),
      method: 'POST',
      path: '/auth/quickconnect/authorize',
      body: { code: '123456' },
    },
  ])('$name', checkEndpoint);
});
