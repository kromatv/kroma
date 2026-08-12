import { useT } from '@kroma/ui';
import { Box, Hint, Text, useFocusNav } from '@kroma/ui/kit';
import { useNav, useParams } from '#tv/app/router';
import { SETTINGS_GROUPS } from '#tv/app/settings/registry';
import { AuthScreen } from '#tv/shared/ui';
import { SettingsRows } from './SettingsRows';

/**
 * One group of settings (route `settingsGroup`): languages, playback, device.
 * The screen holds nothing of its own: the group names a list in the
 * registry, keeping each setting declared exactly once.
 */
export function TvSettingsGroup() {
  const { group } = useParams('settingsGroup');
  const nav = useNav();
  const t = useT();
  useFocusNav({ onBack: nav.back });
  const { label, items } = SETTINGS_GROUPS[group];

  return (
    <AuthScreen>
      <Text variant="titleTv" mb={36}>
        {t(label)}
      </Text>

      <Box w="100%" maxW={560} gap={12}>
        <SettingsRows items={items} />
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
