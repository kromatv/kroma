import { describe, expect, it } from 'vitest';
import { adminOrganizations, appOwners, ownersCookie, readOwners } from './app-owners';
import { gitHubListing, membership } from './test-support';

const OAUTH = { clientId: 'id', clientSecret: 'secret' };
const CALLBACK = { code: 'c', redirectUri: 'https://lingua.test/auth/callback' };
const ADA = { login: 'ada', avatarUrl: 'https://avatars.githubusercontent.com/ada', kind: 'user' } as const;

const cookieHeader = (setCookie: string) => setCookie.split(';')[0] ?? '';

describe('adminOrganizations', () => {
  it('keeps the organisations the account administers, membership accepted', () => {
    const memberships = [
      membership('kromatv', 'admin'),
      membership('elsewhere', 'member'),
      membership('invited', 'admin', 'pending'),
    ];

    const owners = adminOrganizations(memberships);

    expect(owners).toEqual([
      { login: 'kromatv', avatarUrl: 'https://avatars.githubusercontent.com/kromatv', kind: 'organization' },
    ]);
  });
});

describe('appOwners', () => {
  it('lists the personal account first, then each organisation it administers', async () => {
    const fetchFn = gitHubListing([membership('elsewhere', 'member'), membership('kromatv', 'admin')]);

    const owners = await appOwners(OAUTH, CALLBACK, fetchFn);

    expect(owners.map(({ login, kind }) => `${kind}:${login}`)).toEqual(['user:ada', 'organization:kromatv']);
  });
});

describe('readOwners', () => {
  it('reads back the owners this deployment signed', async () => {
    const header = cookieHeader(await ownersCookie([ADA], OAUTH.clientSecret));

    const owners = await readOwners(header, OAUTH.clientSecret);

    expect(owners).toEqual([ADA]);
  });

  it('ignores owners signed with another secret', async () => {
    const header = cookieHeader(await ownersCookie([ADA], 'another secret'));

    const owners = await readOwners(header, OAUTH.clientSecret);

    expect(owners).toEqual([]);
  });
});
