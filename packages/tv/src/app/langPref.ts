// The account's preferred audio and subtitle languages, on the TV.
//
// The hook itself is `@kroma/core/react`'s - one implementation for every
// client, because "picking a language remembers it on the account" must mean
// the same thing on the television, the phone and the web. What stays here is
// this app's five lines: binding the shared hook to THIS app's auth provider
// and client.

import type { LangPatch, LangPrefs } from '@kroma/core/react';
import { useLangPrefs as useSharedLangPrefs } from '@kroma/core/react';
import { useCallback } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useClient } from '#tv/app/router';

export type { LangPrefs } from '@kroma/core/react';
export { prefValue } from '@kroma/core/react';

/** Read + write the account's playback language preferences. */
export function useLangPrefs(): LangPrefs {
  const { user, updateUser } = useAuth();
  const client = useClient();
  const updateAccount = useCallback((patch: LangPatch) => client.updateAccount(patch), [client]);
  return useSharedLangPrefs({ user, updateUser, updateAccount });
}
