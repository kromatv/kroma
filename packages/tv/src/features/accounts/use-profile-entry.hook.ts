import type { StoredSession } from '@kromatv/client/accounts';
import { useAuth } from '#tv/app/providers/auth';
import { useNav } from '#tv/app/router';

/** What a picker tile does with a remembered profile: `enter` signs in to it,
 *  its PIN first when it has one, and `addKids` does the same for the admin
 *  `door`, then opens the Kids profile form (ACCT-135). */
export function useProfileEntry() {
  const nav = useNav();
  const { activate, isUnlocked } = useAuth();
  const locked = (account: StoredSession) => account.user.hasPin && !isUnlocked(account);
  return {
    enter: (account: StoredSession) => {
      if (locked(account)) {
        nav.go('pin', { account });
      } else {
        activate(account);
      }
    },
    addKids: (door: StoredSession) => {
      if (locked(door)) {
        nav.go('pin', { account: door, next: 'addKids' });
        return;
      }
      activate(door);
      nav.go('addKids');
    },
  };
}
