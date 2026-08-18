// @vitest-environment jsdom

import { LANG_NO_PREF, LANG_OFF, LOCALES, type Locale, type Translate } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  user: {} as Record<string, string | null> | null,
  updateUser: vi.fn(),
  updateAccount: vi.fn(),
  setLocale: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ user: H.user, updateUser: H.updateUser }),
}));
vi.mock('#tv/app/router', () => ({ useClient: () => ({ updateAccount: H.updateAccount }) }));

const {
  aboutItem,
  artworkSetting,
  audioLanguageSetting,
  castReceiverSetting,
  crashReportingSetting,
  engineSetting,
  gpuRenderingSetting,
  keyboardLayoutSetting,
  localeSetting,
  perfHudSetting,
  subtitleLanguageSetting,
} = await import('./registry');
const { ARTWORK_SCALE, perfHudPrefStore } = await import('./store');
const { castReceiverPrefStore } = await import('#tv/features/cast/castPref');
const { crashReportingPrefStore } = await import('#tv/app/crashReportingPref');
type SettingsItem = typeof localeSetting;

// langOptions sorts by the translated name, so an identity translator keeps the
// order stable rather than locale-dependent.
const t = ((key: string) => key) as unknown as Translate;
const locale = 'en' as Locale;

const optionsOf = (item: typeof localeSetting) =>
  (item as { options: (t: Translate, l: Locale) => readonly string[] }).options(t, locale);
const labelOf = (item: typeof localeSetting, value: string) =>
  (item as { valueLabel: (v: string) => string }).valueLabel(value);

describe('locale setting', () => {
  it('offers exactly the shipped locales', () => {
    expect(optionsOf(localeSetting)).toEqual(LOCALES.map((l) => l.code));
  });

  it('labels a locale with its own name', () => {
    const first = LOCALES[0];
    if (!first) throw new Error('no locales are shipped');
    expect(labelOf(localeSetting, first.code)).toBe(first.labelKey);
  });

  it('falls back rather than showing a blank row for an unknown code', () => {
    // Unreachable through the picker, but a stored value from an older build can
    // arrive here.
    expect(labelOf(localeSetting, 'xx')).toBe('common.language');
  });
});

describe('language preferences', () => {
  it('audio offers "no preference" first, then the languages', () => {
    const options = optionsOf(audioLanguageSetting);
    expect(options[0]).toBe(LANG_NO_PREF);
    expect(options.length).toBeGreaterThan(1);
    // Audio has no "off": a title always plays some audio track.
    expect(options).not.toContain(LANG_OFF);
  });

  it('subtitles offer "off" as well, distinct from "no preference"', () => {
    const options = optionsOf(subtitleLanguageSetting);
    expect(options.slice(0, 2)).toEqual([LANG_NO_PREF, LANG_OFF]);
    // "Never show subtitles" is a real answer, distinct from declining to choose.
    expect(new Set(options).size).toBe(options.length);
  });

  it('both preferences draw from the same language list', () => {
    const audio = optionsOf(audioLanguageSetting).filter((c) => c !== LANG_NO_PREF);
    const subs = optionsOf(subtitleLanguageSetting).filter(
      (c) => c !== LANG_NO_PREF && c !== LANG_OFF,
    );
    expect(subs).toEqual(audio);
  });

  it('labels off, no-preference and a real language differently', () => {
    const off = labelOf(subtitleLanguageSetting, LANG_OFF);
    const none = labelOf(subtitleLanguageSetting, LANG_NO_PREF);
    const french = labelOf(subtitleLanguageSetting, 'fr');
    expect(off).toBe('player.subtitlesOff');
    expect(none).toBe('account.noPreference');
    expect(new Set([off, none, french]).size).toBe(3);
  });

  it('reads an unknown stored code as "no preference" rather than blank', () => {
    expect(labelOf(audioLanguageSetting, 'zz')).toBe('account.noPreference');
  });
});

describe('keyboard layout setting', () => {
  it('labels every layout it offers', () => {
    const options = optionsOf(keyboardLayoutSetting);
    expect(options.length).toBeGreaterThan(1);
    for (const option of options) expect(labelOf(keyboardLayoutSetting, option)).toBeTruthy();
  });
});

describe('playback engine setting', () => {
  it('labels every engine it offers', () => {
    const options = optionsOf(engineSetting);
    expect(options).toContain('auto');
    for (const option of options) {
      expect(labelOf(engineSetting, option)).toBe(`playbackEngine.${option}`);
    }
  });
});

describe('artwork quality setting', () => {
  it('offers exactly the scales the store knows how to apply', () => {
    // A row the store cannot resolve would set the scale to `undefined` and
    // every URL minted after it would ask for NaN pixels.
    expect(optionsOf(artworkSetting)).toEqual(Object.keys(ARTWORK_SCALE));
  });

  it('labels every scale it offers', () => {
    for (const option of optionsOf(artworkSetting)) {
      expect(labelOf(artworkSetting, option)).toBe(`artworkQuality.${option}`);
    }
  });
});

const choiceBinding = (item: SettingsItem) =>
  (item as { useValue: () => readonly [string, (value: string) => void] }).useValue();
const toggleBinding = (item: SettingsItem) =>
  (item as { useValue: () => readonly [boolean, (value: boolean) => void] }).useValue();

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(I18nProvider, { locale: 'fr' as Locale, onLocaleChange: H.setLocale, children });

beforeEach(() => {
  vi.clearAllMocks();
  H.user = {};
  H.updateAccount.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('what each row is bound to', () => {
  it('locale shows the running one and hands a change back to the app', () => {
    const { result } = renderHook(() => choiceBinding(localeSetting), { wrapper });
    expect(result.current[0]).toBe('fr');
    act(() => result.current[1]('en'));
    expect(H.setLocale).toHaveBeenCalledWith('en');
  });

  it('the language rows read the account and write straight back to it', () => {
    H.user = { audioLanguage: 'fr', subtitleLanguage: null };
    const audio = renderHook(() => choiceBinding(audioLanguageSetting), { wrapper });
    const subtitle = renderHook(() => choiceBinding(subtitleLanguageSetting), { wrapper });
    expect(audio.result.current[0]).toBe('fr');
    expect(subtitle.result.current[0]).toBe(LANG_NO_PREF);

    act(() => subtitle.result.current[1](LANG_OFF));
    expect(H.updateUser).toHaveBeenCalledWith({ subtitleLanguage: LANG_OFF });
  });

  it('the device choices round-trip through their stored preference', () => {
    const layout = renderHook(() => choiceBinding(keyboardLayoutSetting), { wrapper });
    act(() => layout.result.current[1]('azerty'));
    expect(layout.result.current[0]).toBe('azerty');

    const engine = renderHook(() => choiceBinding(engineSetting), { wrapper });
    act(() => engine.result.current[1]('remux'));
    expect(engine.result.current[0]).toBe('remux');

    const artwork = renderHook(() => choiceBinding(artworkSetting), { wrapper });
    act(() => artwork.result.current[1]('medium'));
    expect(artwork.result.current[0]).toBe('medium');
  });

  it('the on/off rows store a word and present a boolean', () => {
    const hud = renderHook(() => toggleBinding(perfHudSetting), { wrapper });
    expect(hud.result.current[0]).toBe(false);
    act(() => hud.result.current[1](true));
    expect(hud.result.current[0]).toBe(true);
    expect(perfHudPrefStore.get()).toBe('on');
    act(() => hud.result.current[1](false));
    expect(perfHudPrefStore.get()).toBe('off');

    const cast = renderHook(() => toggleBinding(castReceiverSetting), { wrapper });
    expect(cast.result.current[0]).toBe(true);
    act(() => cast.result.current[1](false));
    expect(cast.result.current[0]).toBe(false);
    expect(castReceiverPrefStore.get()).toBe('off');
    act(() => cast.result.current[1](true));
    expect(castReceiverPrefStore.get()).toBe('on');

    const crash = renderHook(() => toggleBinding(crashReportingSetting), { wrapper });
    expect(crash.result.current[0]).toBe(false);
    act(() => crash.result.current[1](true));
    expect(crashReportingPrefStore.get()).toBe('on');
    act(() => crash.result.current[1](false));
    expect(crashReportingPrefStore.get()).toBe('off');
  });

  it('GPU rendering reads the desktop shell, then writes and relaunches it', async () => {
    H.invoke.mockImplementation(async (command: string) => command === 'webview_gpu_get');
    vi.stubGlobal('__TAURI__', {
      core: { invoke: H.invoke },
      event: { listen: async () => () => {} },
    });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Tauri' });

    const { result } = renderHook(() => toggleBinding(gpuRenderingSetting), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current[0]).toBe(true);

    await act(async () => {
      result.current[1](false);
      await Promise.resolve();
    });
    expect(result.current[0]).toBe(false);
    expect(H.invoke).toHaveBeenCalledWith('webview_gpu_set', { enabled: false });
    expect(H.invoke).toHaveBeenCalledWith('app_relaunch');
  });
});

describe('aboutItem', () => {
  it('is an action row that opens whatever it was handed', () => {
    const open = vi.fn();
    const item = aboutItem(open);
    expect(item).toMatchObject({ kind: 'action', id: 'about', label: 'about.title' });
    (item as { run: () => void }).run();
    expect(open).toHaveBeenCalled();
  });
});
