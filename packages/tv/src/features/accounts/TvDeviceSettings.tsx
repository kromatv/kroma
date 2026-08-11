import { useT } from '@kroma/ui';
import { Box, Hint, Text, useFocusNav } from '@kroma/ui/kit';
import { useNav } from '#tv/app/router';
import { aboutItem, DEVICE_SETTINGS, quitAppItem } from '#tv/app/settings/registry';
import { AuthScreen, GATE_MARK, KromaMark } from '#tv/shared/ui';
import { SettingsRows } from './SettingsRows';

/** Device settings (route `deviceSettings`), reachable from the signed-out
 * profile picker: the prefs that must not require an account. */
export function TvDeviceSettings() {
  const nav = useNav();
  const t = useT();
  useFocusNav({ onBack: nav.back });

  return (
    <AuthScreen>
      <Box mb={32}>
        <KromaMark size={GATE_MARK} />
      </Box>
      <Text variant="titleTv" mb={36}>
        {t('deviceSettings.title')}
      </Text>

      <Box w="100%" maxW={560} gap={12}>
        <SettingsRows items={[...DEVICE_SETTINGS, aboutItem(() => nav.go('about')), quitAppItem]} />
      </Box>

      <Hint
        text={t('profileMenu.navHint')}
        size={14}
        gap={4}
        mt={28}
        color="text/40"
        textStyle={{ fontWeight: '500' }}
      />
    </AuthScreen>
  );
}
