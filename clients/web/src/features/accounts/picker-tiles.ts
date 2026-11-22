import {
  hasPermission,
  type KidsProfile,
  type PublicUser,
  type StoredSession,
} from '@kromatv/client/accounts';
import type { ProfileChoice } from '#web/features/accounts/profile-picker.component';

/** What the picker offers, in order: the profiles remembered on this device,
 * the server's other accounts when it lists them, then the Kids profiles a
 * member here can open (ACCT-126). A profile already remembered is offered
 * once. `kids` marks the Kids profiles so their avatar carries the mark. */
export function pickerTiles({
  accounts,
  profiles,
  kids,
}: {
  accounts: readonly StoredSession[];
  profiles: readonly PublicUser[];
  kids: readonly KidsProfile[];
}): ProfileChoice[] {
  const kidIds = new Set<string>(kids.map((kid) => kid.id));
  const remembered = new Set<string>(accounts.map((a) => a.user.id));
  const others = [...profiles, ...kids].filter((p) => !remembered.has(p.id));
  return [
    ...accounts.map((a) => ({
      id: a.user.id,
      username: a.user.username,
      avatarUrl: a.user.avatarUrl ?? null,
      remembered: a,
      locked: a.user.hasPin,
      kids: kidIds.has(a.user.id),
    })),
    ...others.map((p) => unremembered(p, kidIds)),
  ];
}

function unremembered(p: PublicUser | KidsProfile, kidIds: ReadonlySet<string>): ProfileChoice {
  const kids = kidIds.has(p.id);
  return {
    id: p.id,
    username: p.username,
    avatarUrl: p.avatarUrl ?? null,
    remembered: null,
    locked: !kids,
    kids,
  };
}

/** The member signed in here through whom the picker adds a Kids profile: the
 * first remembered account that manages users, `null` without one (ACCT-135). */
export function kidsDoor(accounts: readonly StoredSession[]): StoredSession | null {
  return accounts.find((account) => hasPermission(account.user, 'users.manage')) ?? null;
}
