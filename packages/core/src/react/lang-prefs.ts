// The account's preferred audio and subtitle languages - the ONE hook every
// client drives them with. The preference lives on the ACCOUNT (`PATCH
// /auth/me`), not the device, so the choice follows the viewer between the
// television, the phone and the web; each app binds its own HOST adapter
// (session, client instance) around the shared logic here.

import { useCallback } from 'react';
import { LANG_NO_PREF, LANG_OFF, langBase, langRegion, offeredLang } from '../lang';

/** The slice of the account the preferences live on. */
export interface LangPrefUser {
  audioLanguage?: string | null;
  subtitleLanguage?: string | null;
}

export interface LangPatch {
  audioLanguage?: string | null;
  subtitleLanguage?: string | null;
}

/** What the HOST app provides: its session's user, its optimistic local
 * update, and the account PATCH. Nothing here knows which app it is. */
export interface LangPrefsHost {
  user: LangPrefUser | null | undefined;
  updateUser(patch: LangPatch): void;
  // Failures are swallowed here on purpose: a lost PATCH must never interrupt
  // playback, and the next successful write settles it.
  updateAccount(patch: LangPatch): Promise<unknown>;
}

export interface LangPrefs {
  audio: string | null;
  subtitle: string | null;
  setAudio: (code: string | null) => void;
  setSubtitle: (code: string | null) => void;
}

/** Read + write the account's playback language preferences, optimistically. */
export function useLangPrefs(host: LangPrefsHost): LangPrefs {
  const { user, updateUser, updateAccount } = host;

  const audio = normalizeLangPref(user?.audioLanguage);
  const subtitle = normalizeLangPref(user?.subtitleLanguage);

  const save = useCallback(
    (patch: LangPatch) => {
      updateUser(patch);
      updateAccount(patch).catch(() => undefined);
    },
    // The host's functions are expected stable (providers memoise them); the
    // dependency keeps us honest when they are not.
    [updateUser, updateAccount],
  );

  const setAudio = useCallback(
    (code: string | null) => {
      const next = normalizeLangPref(code);
      if (next === audio) return;
      save({ audioLanguage: next });
    },
    [audio, save],
  );

  const setSubtitle = useCallback(
    (code: string | null) => {
      const next = normalizeLangPref(code);
      if (next === subtitle) return;
      save({ subtitleLanguage: next });
    },
    [subtitle, save],
  );

  return { audio, subtitle, setAudio, setSubtitle };
}

/** Stored form of a preference: a canonical language code, the `off` sentinel,
 * or null (no preference); the `none` sentinel the pickers use is a UI value,
 * never a stored one. A region survives normalization (`fr-FR` stays `fr-FR`)
 * so a viewer who picked the VFF track isn't handed the VFQ one next time. */
export function normalizeLangPref(code: string | null | undefined): string | null {
  if (!code || code === LANG_NO_PREF) return null;
  if (code === LANG_OFF) return LANG_OFF;
  const base = langBase(code);
  if (base == null) return null;
  const region = langRegion(code);
  return region ? `${base}-${region}` : base;
}

/** The value a settings row shows for a stored preference (null → `none`).
 * The most specific offered code, not the base, so a viewer who picked the
 * VFQ track sees `fr-CA` ticked rather than a plain "Français" that would
 * discard the variant on re-save. A region nobody offers still falls back to
 * the base, so the picker never comes up with nothing selected. */
export function prefValue(stored: string | null): string {
  if (stored == null) return LANG_NO_PREF;
  if (stored === LANG_OFF) return LANG_OFF;
  return offeredLang(stored) ?? LANG_NO_PREF;
}
