import { describe, expect, it } from 'vitest';
import { memoryStore } from '#site/store/memory-store';
import { ownersCookie } from './app-owners';
import { appManifest } from './setup';
import { seededStore } from './test-support';
import { setupView } from './views';

const ORIGIN = 'https://lingua.test';
const CODE = 'a180b1a3d263c81bc644';
const APP = {
  GITHUB_APP_ID: '1',
  GITHUB_APP_SLUG: 'lingua-test',
  GITHUB_APP_PRIVATE_KEY: 'key',
  GITHUB_WEBHOOK_SECRET: 'secret',
};
const OAUTH = { GITHUB_OAUTH_CLIENT_ID: 'id', GITHUB_OAUTH_CLIENT_SECRET: 'secret' };

describe('appManifest', () => {
  it('registers the App with the permissions, events and addresses of the deployment', () => {
    expect(appManifest(ORIGIN)).toEqual({
      name: 'Lingua lingua.test',
      url: ORIGIN,
      description:
        'Translate this repository in the browser; every contributor’s edits arrive as a pull request.',
      hook_attributes: { url: `${ORIGIN}/webhook`, active: true },
      redirect_url: `${ORIGIN}/setup/done`,
      public: true,
      request_oauth_on_install: false,
      default_permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
      default_events: ['push', 'pull_request'],
    });
  });
});

describe('setupView', () => {
  it('reports every step done once both apps are set and a repository is connected', async () => {
    const context = { env: { ...APP, ...OAUTH }, store: await seededStore(), viewer: null };

    const view = await setupView(context, { origin: ORIGIN, code: CODE, cookies: null });

    expect(view).toMatchObject({
      app: true,
      signIn: true,
      installUrl: 'https://github.com/apps/lingua-test/installations/new',
      repositories: 1,
      code: null,
    });
  });

  it('offers the manifest and keeps the code GitHub returned while the App is missing', async () => {
    const context = { env: {}, store: memoryStore(), viewer: null };

    const view = await setupView(context, { origin: ORIGIN, code: CODE, cookies: null });

    expect(view).toMatchObject({
      app: false,
      signIn: false,
      installUrl: null,
      repositories: 0,
      manifest: JSON.stringify(appManifest(ORIGIN)),
      code: CODE,
    });
  });

  it('hands the page the accounts this browser was handed, its own first', async () => {
    const owners = [
      { login: 'ada', avatarUrl: null, kind: 'user' },
      { login: 'kromatv', avatarUrl: null, kind: 'organization' },
    ] as const;
    const cookies = (await ownersCookie(owners, OAUTH.GITHUB_OAUTH_CLIENT_SECRET)).split(';')[0] ?? null;
    const context = { env: OAUTH, store: memoryStore(), viewer: null };

    const view = await setupView(context, { origin: ORIGIN, code: null, cookies });

    expect(view.owners.map((owner) => owner.login)).toEqual(['ada', 'kromatv']);
  });

  it('drops a code that is not one GitHub sends', async () => {
    const context = { env: {}, store: memoryStore(), viewer: null };

    const view = await setupView(context, { origin: ORIGIN, code: 'rm -rf /', cookies: null });

    expect(view.code).toBeNull();
  });
});
