// Binds `@kromatv/core/react`'s shared language-preference hook to this app's auth
// provider and client.

import type { LangPatch, LangPrefs } from '@kromatv/core/react';
import { useLangPrefs as useSharedLangPrefs } from '@kromatv/core/react';
import { useCallback } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useClient } from '#tv/app/router';

export type { LangPrefs } from '@kromatv/core/react';
export { prefValue } from '@kromatv/core/react';

export function useLangPrefs(): LangPrefs {
  const { user, updateUser } = useAuth();
  const client = useClient();
  const updateAccount = useCallback((patch: LangPatch) => client.accounts.update(patch), [client]);
  return useSharedLangPrefs({ user, updateUser, updateAccount });
}
