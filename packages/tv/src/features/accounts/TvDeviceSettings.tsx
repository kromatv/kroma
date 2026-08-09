import { useT } from '@kroma/ui';
import { Box, Hint, Txt, useFocusNav } from '@kroma/ui/kit';
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
