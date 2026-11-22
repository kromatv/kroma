import { useT } from '@kromatv/ui';
import { Box, Chip, style, Text, useFocusNav } from '@kromatv/ui/kit';
import { useAuth } from '#tv/app/providers/auth';
import { useNav } from '#tv/app/router';
import { useRootBack } from '#tv/app/use-root-back.hook';
import { AuthScreen, GATE_MARK, KromaMark } from '#tv/shared/ui';
import { useProfileMenu } from './profile-menu.hook';
import { TvProfileRow } from './tv-profile-row.component';

const SETTINGS = style({ px: 18, py: 10, borderWidth: 1 });

/**
 * Profile picker, the signed-out home. Shows the profiles paired on this
 * device and the Kids profiles a member here can open; a PIN-protected profile
 * routes to the PIN screen, the rest sign in instantly.
 */
export function TvProfiles() {
  const nav = useNav();
  const t = useT();
  const { accounts } = useAuth();
  const profileMenu = useProfileMenu(useRootBack());
  useFocusNav({ onBack: profileMenu.onBack, resetKey: accounts.length });

  return (
    <AuthScreen>
      <Box mb={28}>
        <KromaMark size={GATE_MARK} />
      </Box>
      <Text variant="titleTv" mb={12}>
        {t('auth.whoWatching')}
      </Text>
      <Text variant="leadTv" mb={44} color="textDim">
        {t('profiles.subtitle')}
      </Text>
      <TvProfileRow onMenu={profileMenu.open} />

      {/* Device settings (language, keyboard, desktop extras) must stay reachable
          while signed out: there is no profile menu yet. */}
      <Box mt={40}>
        <Chip
          variant="subtle"
          icon="settings"
          focusScale={1.04}
          label={t('profiles.deviceSettings')}
          onPress={() => nav.go('deviceSettings')}
          style={SETTINGS}
        />
      </Box>
      {profileMenu.menu}
    </AuthScreen>
  );
}
