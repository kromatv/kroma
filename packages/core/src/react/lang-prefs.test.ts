// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LANG_NO_PREF, LANG_OFF } from '../lang';
import {
  type LangPatch,
  type LangPrefUser,
  normalizeLangPref,
  prefValue,
  useLangPrefs,
} from './lang-prefs';

function host(user: LangPrefUser | null, updateAccount = vi.fn(async () => ({}))) {
  const updateUser = vi.fn((_patch: LangPatch) => undefined);
  const hook = renderHook(() => useLangPrefs({ user, updateUser, updateAccount }));
  return { ...hook, updateUser, updateAccount };
}

describe('normalizeLangPref', () => {
  it('stores no preference for the picker sentinel, an empty code or a nameless one', () => {
    expect(normalizeLangPref(LANG_NO_PREF)).toBeNull();
    expect(normalizeLangPref('')).toBeNull();
    expect(normalizeLangPref(null)).toBeNull();
    expect(normalizeLangPref(undefined)).toBeNull();
    expect(normalizeLangPref('  ')).toBeNull();
  });

  it('keeps the off sentinel as itself', () => {
    expect(normalizeLangPref(LANG_OFF)).toBe(LANG_OFF);
  });

  it('canonicalizes the base but keeps a region, so VFF does not become VFQ', () => {
    expect(normalizeLangPref('fre')).toBe('fr');
    expect(normalizeLangPref('fr_fr')).toBe('fr-FR');
    expect(normalizeLangPref('fr-CA')).toBe('fr-CA');
  });
});

describe('prefValue', () => {
  it('shows the picker sentinel for no stored preference', () => {
    expect(prefValue(null)).toBe(LANG_NO_PREF);
  });

  it('shows the off sentinel verbatim', () => {
    expect(prefValue(LANG_OFF)).toBe(LANG_OFF);
  });

  it('ticks the most specific offered code, falling back to the base', () => {
    expect(prefValue('fr-CA')).toBe('fr-CA');
    expect(prefValue('fr-BE')).toBe('fr');
    expect(prefValue('fr')).toBe('fr');
  });

  it('shows the sentinel rather than nothing for a language nobody offers', () => {
    expect(prefValue('zzz')).toBe(LANG_NO_PREF);
  });
});

describe('useLangPrefs', () => {
  it('normalizes what the account stored before handing it out', () => {
    const { result } = host({ audioLanguage: 'fre', subtitleLanguage: LANG_OFF });
    expect(result.current.audio).toBe('fr');
    expect(result.current.subtitle).toBe(LANG_OFF);
  });

  it('reads null for both when there is no user yet', () => {
    const { result } = host(null);
    expect(result.current.audio).toBeNull();
    expect(result.current.subtitle).toBeNull();
  });

  it('updates locally and PATCHes the account on a change', () => {
    const { result, updateUser, updateAccount } = host({ audioLanguage: null });
    act(() => result.current.setAudio('fr-CA'));
    expect(updateUser).toHaveBeenCalledWith({ audioLanguage: 'fr-CA' });
    expect(updateAccount).toHaveBeenCalledWith({ audioLanguage: 'fr-CA' });
    act(() => result.current.setSubtitle(LANG_OFF));
    expect(updateUser).toHaveBeenCalledWith({ subtitleLanguage: LANG_OFF });
  });

  it('writes nothing when the picked code normalizes to what is already stored', () => {
    const { result, updateUser, updateAccount } = host({
      audioLanguage: 'fr',
      subtitleLanguage: null,
    });
    act(() => result.current.setAudio('fre'));
    act(() => result.current.setSubtitle(LANG_NO_PREF));
    expect(updateUser).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it('keeps the local change when the account PATCH fails', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    const { result, updateUser } = host({ audioLanguage: null }, failing);
    act(() => result.current.setAudio('ja'));
    await act(async () => undefined);
    expect(updateUser).toHaveBeenCalledWith({ audioLanguage: 'ja' });
  });
});
