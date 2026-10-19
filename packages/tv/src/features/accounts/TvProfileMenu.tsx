import { Avatar, Box, Text } from '@kromatv/ui/kit';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { useNav } from '#tv/app/router';
import { PROFILE_GROUPS } from '#tv/app/settings/groups';
import { appPanes } from './settings/appPanes';
import type { SettingsPane } from './settings/panes';
import { SettingsPanes } from './settings/SettingsPanes';

const GROUP_PANES: readonly SettingsPane[] = PROFILE_GROUPS.map((group) => ({
  kind: 'group',
  group,
}));

/** The signed-in settings (route `profileMenu`): the profile's groups, then its account actions. */
export function TvProfileMenu() {
  const nav = useNav();
  const { activeServerUrl, client } = useConnection();
  const { user, switchProfile, logout, forget } = useAuth();

  if (!user || !client) return null;

  const onSignOut = () => {
    if (activeServerUrl) forget(user.id, activeServerUrl);
    else void logout();
  };

  const account: SettingsPane[] = [
    {
      kind: 'action',
      id: 'pin',
      icon: 'lock',
      label: 'profileMenu.pin',
      hint: user.hasPin ? 'profileMenu.on' : 'profileMenu.off',
      description: user.hasPin ? 'settings.pinOnDesc' : 'settings.pinOffDesc',
      run: () => nav.go('pin', { intent: user.hasPin ? 'clear' : 'set' }),
    },
    {
      kind: 'action',
      id: 'changeProfile',
      icon: 'users-group',
      label: 'nav.changeProfile',
      description: 'settings.changeProfileDesc',
      run: switchProfile,
    },
    {
      kind: 'action',
      id: 'signOut',
      icon: 'logout',
      label: 'auth.logout',
      description: 'settings.signOutDesc',
      run: onSignOut,
    },
  ];

  return (
    <SettingsPanes
      header={
        <Box row align="center" gap={20}>
          <Avatar
            name={user.username}
            seed={user.id}
            size={72}
            roundness={0.27}
            src={client.media.artwork.resolve(user.avatarUrl, 72)}
          />
          <Text variant="headingTv" lines={1}>
            {user.username}
          </Text>
        </Box>
      }
      sections={[GROUP_PANES, account, appPanes(() => nav.go('about'))]}
    />
  );
}
