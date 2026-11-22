import type { AuthResult, KidsProfile, UserId } from '@kromatv/client/accounts';
import { type RefObject, useEffect, useRef, useState } from 'react';
import {
  isKidsAccount,
  type KidsChoice,
  kidsOnDevice,
  kidsToOffer,
  type RememberedAccount,
  type ServerKids,
} from '../auth/kids';

/** What a client lends {@link useDeviceKids}: the Kids calls of one server,
 *  and what it does with a session one of them opened. */
export interface DeviceKidsHost {
  kidsOf: (serverUrl: string) => {
    list: (memberAccess: string) => Promise<KidsProfile[]>;
    open: (memberAccess: string, profile: UserId) => Promise<AuthResult>;
  };
  onOpened: (opened: AuthResult, serverUrl: string) => void;
}

/** What a picker draws of the Kids profiles a device can open: the ones not
 *  remembered there yet (`offered`, one tile each), whether a remembered
 *  account is one (`isKids`, for the mark), and `open`, which opens one with
 *  its member's access and hands the session to the host. */
export interface DeviceKids {
  offered: KidsChoice[];
  isKids: (account: RememberedAccount) => boolean;
  open: (choice: KidsChoice) => Promise<void>;
}

/** The Kids profiles this device can open, asked of every server a member is
 *  remembered on (ACCT-126), listed again whenever the accounts change. */
export function useDeviceKids(
  accounts: readonly RememberedAccount[],
  host: DeviceKidsHost,
): DeviceKids {
  const lent = useRef(host);
  useEffect(() => {
    lent.current = host;
  });
  const found = useFoundKids(accounts, lent);
  return {
    offered: kidsToOffer(found, accounts),
    isKids: (account) => isKidsAccount(found, account),
    open: async ({ serverUrl, access, profile }) => {
      const opened = await lent.current.kidsOf(serverUrl).open(access, profile.id);
      lent.current.onOpened(opened, serverUrl);
    },
  };
}

function useFoundKids(
  accounts: readonly RememberedAccount[],
  lent: RefObject<DeviceKidsHost>,
): readonly ServerKids[] {
  const [found, setFound] = useState<readonly ServerKids[]>([]);
  useEffect(() => {
    let cancelled = false;
    const list = (url: string, access: string) => lent.current.kidsOf(url).list(access);
    void kidsOnDevice(accounts, list).then((kids) => {
      if (!cancelled) {
        setFound(kids);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accounts, lent]);
  return found;
}
