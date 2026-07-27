import { useT } from '@kroma/ui';
import { Box, Hint, Txt, useFocusNav } from '@kroma/ui/kit';
import { useNav, useParams } from '#tv/app/router';
import { SETTINGS_GROUPS } from '#tv/app/settings/registry';
import { AuthScreen } from '#tv/shared/ui';
import { SettingsRows } from './SettingsRows';

/**
 * One group of settings (route `settingsGroup`): languages, playback, device.
 *
 * The screen holds nothing of its own - the group NAMES a list in the registry
 * and this renders it with the same <SettingsRows> the flat menus use, so a
 * setting is still declared exactly once. What the extra step buys is a menu
 * that fits: three or four rows under a title, instead of twelve rows that ran
 * off the bottom of a 1080 screen and took the profile's name with them.
 */
export function TvSettingsGroup() {
  const { group } = useParams('settingsGroup');
  const nav = useNav();
  const t = useT();
  useFocusNav({ onBack: nav.back });
  const { label, items } = SETTINGS_GROUPS[group];

  return (
    <AuthScreen>
      <Txt
        variant="hero"
        style={{ fontSize: 44, lineHeight: 44, fontWeight: '600', marginBottom: 36 }}
      >
        {t(label)}
      </Txt>

      <Box w="100%" maxW={560} gap={12}>
        <SettingsRows items={items} />
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
