import { recordingClient } from '@kromatv/client/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({ openAuthSessionAsync: vi.fn() }));
vi.mock('expo-web-browser', () => browser);

import { APP_RETURN, appBrowser, authFor } from './providerSignIn';

beforeEach(() => {
  browser.openAuthSessionAsync.mockReset();
});

describe('the app browser', () => {
  it('opens the provider in the authentication session and waits for the app scheme', async () => {
    browser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await appBrowser('https://kroma.example').open('https://id.test/authorize');

    expect(browser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://id.test/authorize',
      APP_RETURN,
    );
  });

  it('hands back the address the session returned on', async () => {
    browser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'kroma://sso?flow=f1&code=c',
    });

    const back = await appBrowser('https://kroma.example').open('https://id.test/authorize');

    expect(back).toBe('kroma://sso?flow=f1&code=c');
  });

  it.each(['cancel', 'dismiss', 'locked', 'opened'])(
    'hands back nothing when it ends with %s',
    async (type) => {
      browser.openAuthSessionAsync.mockResolvedValue({ type });

      expect(
        await appBrowser('https://kroma.example').open('https://id.test/authorize'),
      ).toBeNull();
    },
  );

  it('tells the server it is an app, and which address it reaches the server on', () => {
    expect(appBrowser('https://kroma.example').from).toEqual({
      returnTo: 'app',
      origin: 'https://kroma.example',
    });
  });
});

describe('the auth object of a server', () => {
  it('is one object per server', () => {
    const { client } = recordingClient();

    expect(authFor('https://a.example', client)).toBe(authFor('https://a.example', client));
    expect(authFor('https://a.example', client)).not.toBe(authFor('https://b.example', client));
  });
});
