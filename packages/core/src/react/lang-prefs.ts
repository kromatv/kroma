// The account's preferred audio and subtitle languages - the ONE hook every
// client drives them with.
//
// The preference lives on the ACCOUNT (`PATCH /auth/me`), not the device: "I
// watch in French" is a fact about the person, so the choice follows the
// viewer between the television, the phone and the web. Each client used to
// carry its own copy of this hook, identical but for where it fetched the
// session - which is exactly the drift the host adapter below removes. An app
// binds its own providers once:
//
//   // the app's five lines
//   export function useLangPrefs(): LangPrefs {
//     const { user, updateUser } = useAuth();
//     const client = useClient();
//     return useSharedLangPrefs({
//       user,
//       updateUser,
//       updateAccount: (patch) => client.updateAccount(patch),
//     });
//   }
//
// Two writers share the result: the account's settings rows, and the player's
// track pickers. Picking a French audio track REMEMBERS the choice, so the
// next title opens in French without anyone visiting a settings screen; the
// pure matching half of that (preferredAudioIndex / preferredSubIndex) lives
// beside this file in the domain layer.

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
  /** Apply the patch to the app's local user state, immediately. */
  updateUser(patch: LangPatch): void;
  /** Persist to the account. Failures are swallowed here: a lost PATCH must
   *  never interrupt playback, and the next successful write settles it. */
  updateAccount(patch: LangPatch): Promise<unknown>;
}

export interface LangPrefs {
  /** Preferred audio language (canonical code), or null for "no preference". */
  audio: string | null;
  /** Preferred subtitle language: a canonical code, `off`, or null. */
  subtitle: string | null;
  /** Persist a preferred audio language (`null` clears it). */
  setAudio: (code: string | null) => void;
  /** Persist a preferred subtitle language (`off` = keep them off, `null` clears). */
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
 * or null (no preference). The `none` sentinel the pickers use is a UI value,
 * never a stored one.
 *
 * A REGION survives normalization (`fr-FR` stays `fr-FR`): it is how a dub
 * variant is remembered - a viewer who picked the VFF track must not be handed
 * the VFQ one on the next title (see `preferredAudioIndex`'s ranking). */
export function normalizeLangPref(code: string | null | undefined): string | null {
  if (!code || code === LANG_NO_PREF) return null;
  if (code === LANG_OFF) return LANG_OFF;
  const base = langBase(code);
  if (base == null) return null;
  const region = langRegion(code);
  return region ? `${base}-${region}` : base;
}

/**
 * The value a settings row shows for a stored preference (null → `none`).
 *
 * The MOST SPECIFIC offered code, not the base. It used to collapse to the base
 * because the pickers only offered one - which meant a viewer who had picked the
 * VFQ track saw a ticked "Français" row, and re-tapping it wrote `fr` back and
 * threw the variant away. Now that `fr-CA` is a row of its own, the row shows
 * the choice that was actually made. A region nobody offers (`pt-AO` off some
 * stray track) still falls back to the base, so the picker never comes up with
 * nothing selected.
 */
export function prefValue(stored: string | null): string {
  if (stored == null) return LANG_NO_PREF;
  if (stored === LANG_OFF) return LANG_OFF;
  return offeredLang(stored) ?? LANG_NO_PREF;
}
