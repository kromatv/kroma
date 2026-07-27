import { useT } from '@kroma/ui';
import { Box, Hint, Txt, useFocusNav } from '@kroma/ui/kit';
import { useNav } from '#tv/app/router';
import { aboutItem, DEVICE_SETTINGS, quitAppItem } from '#tv/app/settings/registry';
import { AuthScreen, KromaMark } from '#tv/shared/ui';
import { SettingsRows } from './SettingsRows';

/**
 * Device settings (route `deviceSettings`), reachable from the signed-out
 * profile picker: the device-level prefs that must not require an account.
 * The rows come straight from the settings registry (DEVICE_SETTINGS), plus the
 * two the registry cannot own outright - About, which needs this screen's
 * navigator, and Quit, which belongs last. Account-level extras live in
 * TvProfileMenu.
 */
export function TvDeviceSettings() {
  const nav = useNav();
  const t = useT();
  useFocusNav({ onBack: nav.back });

  return (
    <AuthScreen>
      <Box mb={32}>
        <KromaMark size={40} />
      </Box>
      <Txt
        variant="hero"
        style={{ fontSize: 44, lineHeight: 44, fontWeight: '600', marginBottom: 36 }}
      >
        {t('deviceSettings.title')}
      </Txt>

      <Box w="100%" maxW={560} gap={12}>
        <SettingsRows items={[...DEVICE_SETTINGS, aboutItem(() => nav.go('about')), quitAppItem]} />
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
