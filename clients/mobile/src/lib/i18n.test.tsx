// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function nobody(): { language: string } | null {
  return null;
}

const state = vi.hoisted(() => ({
  tags: ['en-US'],
  prefs: new Map<string, string>(),
  session: {
    status: 'ready',
    user: nobody(),
    client: {
      accounts: { updateLanguage: vi.fn() },
      setLocale: vi.fn(),
    },
    setUser: vi.fn(),
    setRequestLocale: vi.fn(),
  },
}));

vi.mock('expo-localization', () => ({
  getLocales: () => state.tags.map((languageTag) => ({ languageTag })),
  useLocales: () => state.tags.map((languageTag) => ({ languageTag })),
}));
vi.mock('./storage', () => ({
  loadPref: async (key: string) => state.prefs.get(key) ?? null,
  savePref: async (key: string, value: string) => {
    state.prefs.set(key, value);
  },
}));
vi.mock('./session', () => ({ useSession: () => state.session }));
vi.mock('../../modules/app-language', () => ({ setSystemLanguage: async () => undefined }));

const { I18nProvider, useI18n } = await import('./i18n');

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <I18nProvider>{children}</I18nProvider>;
}

function signedIn(language = 'en') {
  state.session.user = { language };
  state.session.client.accounts.updateLanguage.mockResolvedValue({ user: { language: 'de' } });
}

beforeEach(() => {
  state.tags = ['en-US'];
  state.prefs = new Map();
  state.session.user = null;
  state.session.client.accounts.updateLanguage.mockReset();
  state.session.client.setLocale.mockReset();
  state.session.setUser.mockReset();
  state.session.setRequestLocale.mockReset();
});

describe('the language the app speaks', () => {
  it('is the one picked on this device, and every request asks for it', async () => {
    state.prefs.set('locale', 'fr');
    state.prefs.set('systemLocale', 'en');

    const { result } = renderHook(useI18n, { wrapper });

    await waitFor(() => expect(result.current.locale).toBe('fr'));
    expect(state.session.setRequestLocale).toHaveBeenLastCalledWith('fr');
    expect(state.session.client.setLocale).toHaveBeenLastCalledWith('fr');
  });

  it("is the account's when the phone asks for no language the app offers", async () => {
    state.tags = ['xx-XX'];
    signedIn('ja');

    const { result } = renderHook(useI18n, { wrapper });

    await waitFor(() => expect(result.current.locale).toBe('ja'));
  });
});

describe('a language picked in the app', () => {
  it('is written to the signed-in account, which then holds it', async () => {
    signedIn();
    const { result } = renderHook(useI18n, { wrapper });

    act(() => result.current.choose('de'));

    await waitFor(() => expect(state.session.setUser).toHaveBeenCalledWith({ language: 'de' }));
    expect(state.session.client.accounts.updateLanguage).toHaveBeenCalledExactlyOnceWith('de');
    expect(result.current.locale).toBe('de');
  });

  it('stays on this device while no one is signed in', async () => {
    const { result } = renderHook(useI18n, { wrapper });

    act(() => result.current.choose('de'));

    await waitFor(() => expect(result.current.locale).toBe('de'));
    expect(state.session.client.accounts.updateLanguage).not.toHaveBeenCalled();
  });

  it('stays on this device when the account cannot be written', async () => {
    signedIn();
    state.session.client.accounts.updateLanguage.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(useI18n, { wrapper });

    act(() => result.current.choose('de'));

    await waitFor(() => expect(state.session.client.accounts.updateLanguage).toHaveBeenCalled());
    expect(result.current.locale).toBe('de');
    expect(state.session.setUser).not.toHaveBeenCalled();
  });
});
