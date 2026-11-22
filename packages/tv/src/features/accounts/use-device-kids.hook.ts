import type { StoredSession } from '@kromatv/client/accounts';
import { type DeviceKids, useDeviceKids as useKidsOn } from '@kromatv/core/react';
import { makeClient } from '#tv/app/api-client';
import { useAuth } from '#tv/app/providers/auth';
import { useConnectionMaybe } from '#tv/app/providers/connection';

/** The Kids profiles this television can open (ACCT-126): opening one signs
 *  the television in to it on its own server. */
export function useDeviceKids(accounts: readonly StoredSession[]): DeviceKids {
  const shell = useConnectionMaybe()?.platform;
  const { login } = useAuth();
  return useKidsOn(accounts, {
    kidsOf: (url) => makeClient(url, { shell }).accounts.kids,
    onOpened: login,
  });
}
