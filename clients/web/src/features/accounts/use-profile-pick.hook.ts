import { askForKidsProfile } from '@kromatv/core';
import type { PublicUser, StoredSession } from '@kromatv/client/accounts';
import type { ProfileChoice } from '#web/features/accounts/profile-picker.component';
import { useKidsProfiles } from '#web/features/accounts/use-kids-profiles.hook';
import { useAuth } from '#web/shared/lib/auth';

/** The step the gate shows after a tile is pressed, when it is not done. */
export type PickStep =
  | { kind: 'login'; user: PublicUser | null; expired?: boolean }
  | { kind: 'pin'; account: StoredSession };

/** What pressing a picker tile does: open a Kids profile with a member's
 * credential, enter a remembered profile (its PIN first when the server asks
 * for it), or sign one in. `addKids` enters the admin `door` the same way, then
 * opens the Kids profile form (ACCT-135). */
export function useProfilePick(onStep: (step: PickStep) => void) {
  const { client, accounts, activate, enter } = useAuth();
  const kids = useKidsProfiles(accounts);

  const enterRemembered = async (acc: StoredSession) => {
    const r = await activate(acc);
    if (r.ok) {
      return;
    }
    onStep(
      r.needsPin ? { kind: 'pin', account: acc } : { kind: 'login', user: acc.user, expired: true },
    );
  };

  const pick = async (tile: ProfileChoice) => {
    if (tile.kids && !tile.remembered && kids.access) {
      enter(await client.accounts.kids.open(kids.access, tile.id));
      return;
    }
    if (tile.remembered) {
      await enterRemembered(tile.remembered);
      return;
    }
    const user = { id: tile.id, username: tile.username, avatarUrl: tile.avatarUrl, hasPin: false };
    onStep({ kind: 'login', user });
  };

  const addKids = async (door: StoredSession) => {
    askForKidsProfile(door.user.id);
    await enterRemembered(door);
  };

  return { kids, pick, addKids };
}
