import type { SettingsPane } from './panes';
import { PinPanel } from './pin-panel.component';

/** What the account panes do when chosen. */
export interface AccountActions {
  switchProfile: () => void;
  signOut: () => void;
}

/** The profile's own panes in the settings: its PIN, switching profile and
 *  signing out. A Kids session keeps only switching profile, its one way out
 *  (ACCT-131, ACCT-137). */
export function accountPanes(
  user: Readonly<{ hasPin: boolean; kids?: boolean }>,
  actions: AccountActions,
): SettingsPane[] {
  const change: SettingsPane = {
    kind: 'action',
    id: 'changeProfile',
    icon: 'users-group',
    label: 'nav.changeProfile',
    description: 'settings.changeProfileDesc',
    run: actions.switchProfile,
  };
  return user.kids ? [change] : [pinPane(user), change, signOutPane(actions.signOut)];
}

function pinPane({ hasPin }: Readonly<{ hasPin: boolean }>): SettingsPane {
  return {
    kind: 'panel',
    id: 'pin',
    icon: 'lock',
    label: 'profileMenu.pin',
    hint: hasPin ? 'profileMenu.on' : 'profileMenu.off',
    Panel: PinPanel,
  };
}

function signOutPane(run: () => void): SettingsPane {
  return {
    kind: 'action',
    id: 'signOut',
    icon: 'logout',
    label: 'auth.logout',
    description: 'settings.signOutDesc',
    run,
  };
}
