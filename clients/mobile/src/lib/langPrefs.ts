// Binds `@kromatv/core/react`'s shared language-preference hook to this app's
// session.

import type { LangPatch, LangPrefs } from '@kromatv/core/react';
import { useLangPrefs as useSharedLangPrefs } from '@kromatv/core/react';
import { useCallback } from 'react';
import { useClient, useSession } from '#mobile/lib/session';

export type { LangPrefs } from '@kromatv/core/react';

export function useLangPrefs(): LangPrefs {
  const { user, setUser } = useSession();
  const client = useClient();
  const updateUser = useCallback(
    (patch: LangPatch) => {
      if (user) setUser({ ...user, ...patch });
    },
    [user, setUser],
  );
  const updateAccount = useCallback((patch: LangPatch) => client.accounts.update(patch), [client]);
  return useSharedLangPrefs({ user, updateUser, updateAccount });
}
