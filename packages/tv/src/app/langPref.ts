// Binds `@kroma/core/react`'s shared language-preference hook to this app's auth
// provider and client.

import type { LangPatch, LangPrefs } from '@kroma/core/react';
import { useLangPrefs as useSharedLangPrefs } from '@kroma/core/react';
import { useCallback } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useClient } from '#tv/app/router';

export type { LangPrefs } from '@kroma/core/react';
export { prefValue } from '@kroma/core/react';

export function useLangPrefs(): LangPrefs {
  const { user, updateUser } = useAuth();
  const client = useClient();
  const updateAccount = useCallback((patch: LangPatch) => client.updateAccount(patch), [client]);
  return useSharedLangPrefs({ user, updateUser, updateAccount });
}
