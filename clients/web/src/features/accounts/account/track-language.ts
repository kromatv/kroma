import type { AccountPatch, User } from '@kromatv/client/accounts';
import { LANG_NO_PREF } from '@kromatv/core';
import { prefValue } from '@kromatv/core/react';

/** Which of the account's playback languages a pick is for. */
export type TrackLanguage = 'audioLanguage' | 'subtitleLanguage';

/** What a pick writes through: the account on the server, and the session's copy. */
export interface TrackLanguageHost {
  client: {
    accounts: { update: (patch: AccountPatch) => Promise<{ user: Pick<User, TrackLanguage> }> };
  };
  updateUser: (patch: Partial<User>) => void;
}

/** Saves a picker's `value` as the account's language for `track`, `none` being no
 *  preference, and gives back what the account holds now, as a picker's value. */
export async function saveTrackLanguage(
  { client, updateUser }: TrackLanguageHost,
  track: TrackLanguage,
  value: string,
): Promise<string> {
  const { user: saved } = await client.accounts.update({
    [track]: value === LANG_NO_PREF ? null : value,
  });
  updateUser({ [track]: saved[track] ?? null });
  return prefValue(saved[track] ?? null);
}
