// @vitest-environment jsdom
import { LOCALES } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLanguagePreferences } from './use-language-preferences.hook';

const mocks = vi.hoisted(() => ({
  setLocale: vi.fn(),
  save: vi.fn(),
  auth: {
    user: { audioLanguage: 'ja', subtitleLanguage: 'off' },
    client: {},
    updateUser: () => {},
  },
}));
vi.mock('@kromatv/ui', () => ({
  useLocale: () => 'fr',
  useSetLocale: () => mocks.setLocale,
}));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('#web/features/accounts/account/track-language', () => ({
  saveTrackLanguage: mocks.save,
}));

const NAMES: Record<string, string> = { 'lang.de': 'Allemand', 'lang.ja': 'Japonais' };
const t: Translate = (key: string, _vars?: unknown) => NAMES[key] ?? key;

const preferences = () => renderHook(() => useLanguagePreferences(t)).result.current;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the interface language in the command menu', () => {
  it('offers every language on offer, and marks the one in use', () => {
    const { screen } = preferences();

    expect(screen.choices.map((choice) => choice.value).sort()).toEqual(
      LOCALES.map((locale) => locale.code).sort(),
    );
    expect(screen.current).toBe('fr');
  });

  it('names each one in its own words, with its flag, and in the reader’s words beside', () => {
    const german = preferences().screen.choices.find((choice) => choice.value === 'de');

    expect(german).toMatchObject({
      label: 'Deutsch',
      subtitle: 'Allemand',
      flag: 'DE',
      lang: 'de',
    });
  });

  it('says nothing beside a language the reader’s words name as it names itself', () => {
    const french = preferences().screen.choices.find((choice) => choice.value === 'fr');

    expect(french?.subtitle).toBeUndefined();
  });

  it('switches the interface the way the account page does', () => {
    void preferences()
      .screen.choices.find((choice) => choice.value === 'de')
      ?.pick();

    expect(mocks.setLocale).toHaveBeenCalledWith('de');
  });
});

describe('the audio and subtitle languages in the command menu', () => {
  it('read what the account holds', () => {
    const [audio, subtitles] = preferences().tracks;

    expect(audio?.current).toBe('ja');
    expect(subtitles?.current).toBe('off');
  });

  it('start with no preference, and offer none at all for subtitles alone', () => {
    const [audio, subtitles] = preferences().tracks;

    expect(audio?.choices[0]?.value).toBe('none');
    expect(audio?.choices.map((choice) => choice.value)).not.toContain('off');
    expect(subtitles?.choices.slice(0, 2).map((choice) => choice.value)).toEqual(['none', 'off']);
  });

  it('save a pick on the account', () => {
    const [audio] = preferences().tracks;

    void audio?.choices.find((choice) => choice.value === 'ja')?.pick();

    expect(mocks.save).toHaveBeenCalledWith(mocks.auth, 'audioLanguage', 'ja');
  });
});
