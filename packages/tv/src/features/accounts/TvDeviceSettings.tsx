import { useT } from '@kromatv/ui';
import { Box, Text, useFocusNav } from '@kromatv/ui/kit';
import { useNav } from '#tv/app/router';
import { DEVICE_GROUPS } from '#tv/app/settings/groups';
import { GATE_MARK, KromaMark } from '#tv/shared/ui';
import { appPanes } from './settings/appPanes';
import type { SettingsPane } from './settings/panes';
import { SettingsPanes } from './settings/SettingsPanes';

const GROUP_PANES: readonly SettingsPane[] = DEVICE_GROUPS.map((group) => ({
  kind: 'group',
  group,
}));

/** Device settings (route `deviceSettings`), reachable from the signed-out
 * profile picker: the prefs that must not require an account. */
export function TvDeviceSettings() {
  const nav = useNav();
  const t = useT();
  useFocusNav({ onBack: nav.back });

  return (
    <SettingsPanes
      header={
        <Box row align="center" gap={20}>
          <KromaMark size={GATE_MARK} />
          <Text variant="headingTv">{t('deviceSettings.title')}</Text>
        </Box>
      }
      sections={[GROUP_PANES, appPanes(() => nav.go('about'))]}
    />
  );
}
