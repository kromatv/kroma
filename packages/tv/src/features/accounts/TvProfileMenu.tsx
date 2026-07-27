import { useT } from '@kroma/ui';
import { Avatar, Box, Hint, Txt, useFocusNav } from '@kroma/ui/kit';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { useNav } from '#tv/app/router';
import { actionItem } from '#tv/app/settings/items';
import { aboutItem, groupItem, quitAppItem, SETTINGS_GROUPS } from '#tv/app/settings/registry';
import { AuthScreen } from '#tv/shared/ui';
import { SettingsRows } from './SettingsRows';

/** Profile menu (route `profileMenu`): the settings GROUPS (languages,
 * playback, device - each opening a screen of its own) followed by the account
 * rows built inline - PIN, change profile, sign out, quit. Removing a server
 * happens by signing its profiles out, not from here. Every stateful
 * hook lives inside SettingsRows' row components, so the `!user` early return
 * below can't break hook order. */
export function TvProfileMenu() {
  const nav = useNav();
  const t = useT();
  const { activeServerUrl, client } = useConnection();
  const { user, switchProfile, logout, forget } = useAuth();
  useFocusNav({ onBack: nav.back });

  if (!user) return null;

  const onSignOut = () => {
    if (activeServerUrl) forget(user.id, activeServerUrl);
    else void logout();
  };

  const rows = [
    // The settings, one step deeper: three rows that each open a screen, rather
    // than the seven that used to sit here. Twelve rows did not fit a 1080
    // screen, so the avatar and the name - the one thing that says WHOSE menu
    // this is - scrolled away the moment you moved.
    ...Object.values(SETTINGS_GROUPS).map((group) =>
      groupItem(group, () => nav.go('settingsGroup', { group: group.id })),
    ),
    actionItem({
      id: 'pin',
      icon: 'lock',
      label: user.hasPin ? 'profileMenu.removePin' : 'profileMenu.setPin',
      badge: user.hasPin
        ? { label: 'profileMenu.on', tone: 'success' as const }
        : { label: 'profileMenu.off', tone: 'dim' as const },
      run: () => nav.go('pin', { intent: user.hasPin ? 'clear' : 'set' }),
    }),
    actionItem({
      id: 'changeProfile',
      icon: 'users-group',
      label: 'nav.changeProfile',
      run: switchProfile,
    }),
    actionItem({ id: 'signOut', icon: 'logout', label: 'auth.logout', run: onSignOut }),
    aboutItem(() => nav.go('about')),
    quitAppItem,
  ];

  return (
    <AuthScreen>
      <Box align="center" gap={14} mb={32}>
        <Avatar
          name={user.username}
          seed={user.id}
          size={96}
          roundness={0.27}
          src={client?.resolveArt(user.avatarUrl)}
        />
        <Txt variant="h1" style={{ fontSize: 32, fontWeight: '600' }}>
          {user.username}
        </Txt>
      </Box>

      <Box w="100%" maxW={560} gap={12}>
        <SettingsRows items={rows} />
      </Box>

      <Hint
        text={t('profileMenu.navHint')}
        size={14}
        gap={4}
        mt={28}
        color="rgba(244, 243, 240, 0.4)"
        textStyle={{ fontWeight: '500' }}
      />
    </AuthScreen>
  );
}
