// The account's preferred audio and subtitle languages, on the phone.
//
// The hook itself is `@kroma/core/react`'s - one implementation for every
// client, because "picking a language remembers it on the account" must mean
// the same thing on the television, the phone and the web. What stays here is
// this app's five lines: binding the shared hook to THIS app's session.

import type { LangPatch, LangPrefs } from '@kroma/core/react';
import { useLangPrefs as useSharedLangPrefs } from '@kroma/core/react';
import { useCallback } from 'react';
import { useClient, useSession } from '#mobile/lib/session';

export type { LangPrefs } from '@kroma/core/react';

/** Read + write the account's playback language preferences. */
export function useLangPrefs(): LangPrefs {
  const { user, setUser } = useSession();
  const client = useClient();
  const updateUser = useCallback(
    (patch: LangPatch) => {
      if (user) setUser({ ...user, ...patch });
    },
    [user, setUser],
  );
  const updateAccount = useCallback((patch: LangPatch) => client.updateAccount(patch), [client]);
  return useSharedLangPrefs({ user, updateUser, updateAccount });
}
