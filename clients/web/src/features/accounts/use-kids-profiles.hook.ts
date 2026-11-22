import type { KidsProfile, StoredSession } from '@kromatv/client/accounts';
import { useEffect, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

interface MemberKids {
  access: string | null;
  profiles: KidsProfile[];
}

const NONE: MemberKids = { access: null, profiles: [] };

/** The Kids profiles this device may open, listed with the access token of a
 * member remembered here (ACCT-126), and that token to open one with. A
 * device that remembers no member lists none. */
export function useKidsProfiles(accounts: readonly StoredSession[]): MemberKids {
  const { client } = useAuth();
  const [found, setFound] = useState<MemberKids>(NONE);
  useEffect(() => {
    let cancelled = false;
    void listedByAMember(accounts, (access) => client.accounts.kids.list(access)).then((kids) => {
      if (!cancelled) {
        setFound(kids);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, accounts]);
  return found;
}

async function listedByAMember(
  accounts: readonly StoredSession[],
  list: (access: string) => Promise<KidsProfile[]>,
): Promise<MemberKids> {
  const answers = await Promise.allSettled(accounts.map((a) => list(a.accessToken)));
  const index = answers.findIndex((answer) => answer.status === 'fulfilled');
  const answer = answers[index];
  if (answer?.status !== 'fulfilled') {
    return NONE;
  }
  return { access: accounts[index]?.accessToken ?? null, profiles: answer.value };
}
