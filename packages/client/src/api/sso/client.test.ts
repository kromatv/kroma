import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { InviteToken } from '../accounts/ids';
import { FlowId, IdentityId, JoinRequestId, ProviderId } from './ids';

const provider = ProviderId.parse('p0');
const keys = { flowId: FlowId.parse('f1'), secret: 's', code: 'c' };
const request = JoinRequestId.parse('j1');

describe('the sign-in flow endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'start with the invitation the person arrived on',
      call: (c) => c.sso.start(provider, { invite: InviteToken.parse('inv1') }),
      method: 'POST',
      path: '/auth/sso/start',
      auth: 'public',
      body: { provider: 'p0', invite: 'inv1' },
    },
    {
      name: 'start from an app, which names its server and asks to come back on its scheme',
      call: (c) =>
        c.sso.start(provider, { from: { returnTo: 'app', origin: 'https://kroma.example' } }),
      method: 'POST',
      path: '/auth/sso/start',
      auth: 'public',
      body: { provider: 'p0', returnTo: 'app', origin: 'https://kroma.example' },
    },
    {
      name: 'finish',
      call: (c) => c.sso.finish(keys),
      method: 'POST',
      path: '/auth/sso/finish',
      auth: 'public',
      body: { flowId: 'f1', secret: 's', code: 'c' },
    },
    {
      name: 'claim',
      call: (c) => c.sso.claim(keys),
      method: 'POST',
      path: '/auth/sso/claim',
      body: { flowId: 'f1', secret: 's', code: 'c' },
    },
  ])('$name', checkEndpoint);
});

describe("an account's provider identities", () => {
  it.each<Endpoint>([
    {
      name: 'identities',
      call: (c) => c.sso.identities(),
      method: 'GET',
      path: '/auth/me/identities',
    },
    {
      name: 'link',
      call: (c) => c.sso.link(provider),
      method: 'POST',
      path: '/auth/me/identities',
      body: { provider: 'p0' },
    },
    {
      name: 'unlink',
      call: (c) => c.sso.unlink(IdentityId.parse('id/1')),
      method: 'DELETE',
      path: '/auth/me/identities/id%2F1',
    },
  ])('$name', checkEndpoint);
});

describe("the admin's sign-in endpoints", () => {
  it.each<Endpoint>([
    { name: 'config', call: (c) => c.sso.config(), method: 'GET', path: '/admin/sign-in' },
    {
      name: 'save',
      call: (c) => c.sso.save({ methods: [{ kind: 'password', enabled: true }] }),
      method: 'PUT',
      path: '/admin/sign-in',
      body: { methods: [{ kind: 'password', enabled: true }] },
    },
    {
      name: 'discover',
      call: (c) => c.sso.discover('https://id.example'),
      method: 'POST',
      path: '/admin/sign-in/discover',
      body: { issuer: 'https://id.example' },
    },
    {
      name: 'test',
      call: (c) => c.sso.test(provider),
      method: 'POST',
      path: '/admin/sign-in/test',
      body: { provider: 'p0' },
    },
    {
      name: 'joinRequests',
      call: (c) => c.sso.joinRequests(),
      method: 'GET',
      path: '/admin/join-requests',
    },
    {
      name: 'approve',
      call: (c) => c.sso.approve(request, { permissions: ['playback'], libraries: null }),
      method: 'POST',
      path: '/admin/join-requests/j1/approve',
      body: { permissions: ['playback'], libraries: null },
    },
    {
      name: 'decline',
      call: (c) => c.sso.decline(request),
      method: 'POST',
      path: '/admin/join-requests/j1/decline',
    },
    {
      name: 'forget',
      call: (c) => c.sso.forget(request),
      method: 'DELETE',
      path: '/admin/join-requests/j1',
    },
  ])('$name', checkEndpoint);
});
