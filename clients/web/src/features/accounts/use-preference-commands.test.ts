// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { RatingsCountry } from '@kromatv/client/accounts';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { forgetCommands, listedCommands } from '#web/shared/lib/command-menu.fixture';
import type { ChoicePreference } from './preference-commands';
import { usePreferenceCommands } from './use-preference-commands.hook';

const choice = (value: string, label: string) => ({ value, label, pick: () => {} });

const language = (id: string, name: string): ChoicePreference => ({
  id,
  name,
  icon: 'language',
  keywords: '',
  current: 'none',
  choices: [choice('none', 'No preference'), choice('de', 'Deutsch')],
});

interface Mocks {
  kids: boolean;
  blur: boolean;
  setBlur: Mock;
  blocker: string | null;
  setSubscribed: Mock;
  ratings: RatingsCountry | undefined;
  choose: Mock;
  asked: unknown[];
}

const mocks: Mocks = vi.hoisted(() => ({
  kids: false,
  blur: true,
  setBlur: vi.fn(),
  blocker: null,
  setSubscribed: vi.fn(),
  ratings: undefined,
  choose: vi.fn(),
  asked: [],
}));
vi.mock('@kromatv/ui', () => ({
  useT: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('#web/features/accounts/use-language-preferences.hook', () => ({
  useLanguagePreferences: () => ({
    screen: language('locale', 'account.uiLanguage'),
    tracks: [
      language('audioLanguage', 'account.audioLanguage'),
      language('subtitleLanguage', 'account.subtitleLanguage'),
    ],
  }),
}));
vi.mock('#web/features/accounts/account/use-ratings-country.hook', async (original) => ({
  ...(await original<typeof import('#web/features/accounts/account/use-ratings-country.hook')>()),
  useRatingsCountry: (options: unknown) => {
    mocks.asked.push(options);
    return { ratings: mocks.ratings, choose: mocks.choose };
  },
}));
vi.mock('#web/features/accounts/account/use-device-push.hook', () => ({
  useDevicePush: () => ({
    blocker: mocks.blocker,
    subscribed: false,
    setSubscribed: mocks.setSubscribed,
  }),
}));
vi.mock('#web/features/accounts/account/use-notification-prefs.hook', () => ({
  useNotificationPrefs: () => ({ prefs: undefined, save: vi.fn() }),
}));
vi.mock('#web/shared/lib/blur-pref', () => ({
  useBlurPreference: () => [mocks.blur, mocks.setBlur],
}));
vi.mock('#web/shared/lib/use-kids-session.hook', () => ({ useKidsSession: () => mocks.kids }));
vi.mock('#web/shared/lib/command-menu', async () => ({
  useCommands: (await import('#web/shared/lib/command-menu.fixture')).useFakeCommands,
}));

const labels = () => listedCommands().map((command) => command.label);
const row = (label: string) => listedCommands().find((command) => command.label === label);
const listOf = (label: string) => (row(label)?.items ?? []).flatMap((one) => (one ? [one] : []));

beforeEach(() => {
  mocks.kids = false;
  mocks.blocker = null;
  mocks.ratings = { country: null, household: 'CH', countries: ['DE'] };
  mocks.asked = [];
});

afterEach(() => {
  cleanup();
  forgetCommands();
  vi.clearAllMocks();
});

describe('the preferences in the command menu', () => {
  it('stand as one row each with nothing typed, in the order of the account page', () => {
    renderHook(() => usePreferenceCommands());

    expect(labels()).toEqual([
      'account.uiLanguage',
      'settings.blur',
      'account.audioLanguage',
      'account.subtitleLanguage',
      'account.ratingsCountry',
      'push.title',
      'notifications.settings',
    ]);
  });

  it('are filed under the preferences', () => {
    renderHook(() => usePreferenceCommands());

    expect(listedCommands().every((command) => command.group === 'account.preferences')).toBe(true);
  });

  it('keep their values in a list of their own, out of the menu’s', () => {
    renderHook(() => usePreferenceCommands());

    expect(listOf('account.audioLanguage').map((value) => value.label)).toEqual([
      'No preference',
      'Deutsch',
    ]);
    expect(labels()).not.toContain('Deutsch');
  });

  it('leave a Kids session nothing, and ask the server nothing for it', () => {
    mocks.kids = true;

    renderHook(() => usePreferenceCommands());

    expect(listedCommands()).toEqual([]);
    expect(mocks.asked).toContainEqual({ enabled: false });
  });

  it('leave push out where the browser cannot receive it', () => {
    mocks.blocker = 'insecure';

    renderHook(() => usePreferenceCommands());

    expect(labels()).not.toContain('push.title');
  });

  it('turn the blur off when it is on', () => {
    renderHook(() => usePreferenceCommands());

    void row('settings.blur')?.run?.();

    expect(mocks.setBlur).toHaveBeenCalledWith(false);
  });

  it('turn push on for this device', () => {
    renderHook(() => usePreferenceCommands());

    void row('push.title')?.run?.();

    expect(mocks.setSubscribed).toHaveBeenCalledWith(true);
  });

  it('leave the age ratings out until the server has said whose they are', () => {
    mocks.ratings = undefined;

    renderHook(() => usePreferenceCommands());

    expect(labels()).not.toContain('account.ratingsCountry');
  });

  it('offer each country of the age ratings with its flag, and save a pick', () => {
    renderHook(() => usePreferenceCommands());
    const germany = listOf('account.ratingsCountry').find((value) => value.label === 'Germany');
    void germany?.run?.();

    expect(germany?.flag).toBe('DE');
    expect(mocks.choose).toHaveBeenCalledWith('DE');
  });
});
