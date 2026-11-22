/** What the account tab shows of the signed-in profile. */
export interface ProfileIdentity {
  name: string;
  addresses: string[];
  avatarPath: string | null;
  editable: boolean;
}

const NOBODY: ProfileIdentity = { name: '', addresses: [], avatarPath: null, editable: false };

/** The profile as the account tab shows it: its name, its address (none for a
 *  Kids profile, whose address is a placeholder nobody reads), its avatar, and
 *  whether the avatar opens the profile editor, which a Kids session never
 *  does (ACCT-137). */
export function profileIdentity(
  user: Readonly<{
    username: string;
    email: string;
    avatarUrl?: string | null;
    kids?: boolean;
  }> | null,
): ProfileIdentity {
  if (!user) {
    return NOBODY;
  }
  const kids = user.kids === true;
  return {
    name: user.username,
    addresses: kids || !user.email ? [] : [user.email],
    avatarPath: user.avatarUrl ?? null,
    editable: !kids,
  };
}
