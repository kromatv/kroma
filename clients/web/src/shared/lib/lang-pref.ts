// The account's preferred audio and subtitle languages, on the web.
//
// The hook itself is `@kroma/core/react`'s - one implementation for every
// client, because "picking a language remembers it on the account" must mean
// the same thing on the television, the phone and the web. What stays here is
// this app's five lines: binding the shared hook to THIS app's auth provider.
//
// The web went without it longest, and silently: it READ the preference (the
// engine applies `preferredAudioIndex` on load, the subtitle hook applies
// `preferredSubIndex`) but never wrote one back, so a track picked here was
// forgotten the moment the title ended while the same pick on the phone or the
// television followed the viewer everywhere. Reading a preference nobody on
// this client can set is the drift the shared hook exists to prevent.

import type { LangPatch, LangPrefs } from '@kroma/core/react';
import { useLangPrefs as useSharedLangPrefs } from '@kroma/core/react';
import { useCallback } from 'react';
import { useAuth } from '#web/shared/lib/auth';

export type { LangPrefs } from '@kroma/core/react';

/** Read + write the account's playback language preferences. */
export function useLangPrefs(): LangPrefs {
  const { user, client, updateUser } = useAuth();
  const updateAccount = useCallback((patch: LangPatch) => client.updateAccount(patch), [client]);
  return useSharedLangPrefs({ user, updateUser, updateAccount });
}
