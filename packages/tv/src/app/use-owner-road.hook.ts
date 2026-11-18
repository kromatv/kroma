import { useEffect, useRef } from 'react';
import { ownerMove } from '#tv/app/nav-policy';
import { useAuth } from '#tv/app/providers/auth';
import { useServerOwner } from '#tv/app/providers/server-owner';
import { useNav } from '#tv/app/router';

/** Moves a signed-out television between the pairing code and the notice that
 * its server has no account, as {@link ownerMove} decides. */
export function useOwnerRoad(): void {
  const nav = useNav();
  const { user, accounts } = useAuth();
  const { owner } = useServerOwner();
  const noticed = useRef(false);

  useEffect(() => {
    const route = nav.route.name;
    noticed.current = owner === 'missing' && (noticed.current || route === 'unowned');
    if (user) {
      return;
    }
    const move = ownerMove({ route, owner, profiles: accounts.length, noticed: noticed.current });
    if (move) {
      nav[move.via](move.to);
    }
  }, [nav, user, owner, accounts.length]);
}
