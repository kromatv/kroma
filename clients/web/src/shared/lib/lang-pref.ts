// The account's preferred audio and subtitle languages, on the web.
//
// The hook itself is `@kroma/core/react`'s - one implementation for every
// client, because "picking a language remembers it on the account" must mean
// the same thing on the television, the phone and the web. What stays here is
// this app's binding of the shared hook to this app's auth provider.

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
