import type { MinAvailability, MonitorPreset } from '@kromatv/client/monitoring';
import { useT } from '@kromatv/ui';
import { Disclosure, Divider, Surface, Switch } from '@kromatv/ui/kit';
import {
  AvailabilitySelect,
  PresetSelect,
  SettingRow,
  SpecialsSwitch,
} from '#web/features/admin/monitoring-options';

export interface AddSettings {
  preset: MonitorPreset;
  monitorSpecials: boolean;
  minAvailability: MinAvailability;
  searchNow: boolean;
}

export function AddOptions({
  settings,
  shows,
  films,
  onChange,
}: Readonly<{
  settings: AddSettings;
  shows: boolean;
  films: boolean;
  onChange: (next: AddSettings) => void;
}>) {
  const t = useT();
  return (
    <Disclosure.Root>
      <Disclosure.Trigger>{t('monitoring.addOptions')}</Disclosure.Trigger>
      <Disclosure.Panel>
        <Surface pad="none" radius="xl" border="border" overflow="hidden">
          {shows ? (
            <>
              <SettingRow label={t('monitoring.preset')} hint={t('monitoring.presetHint')} block>
                <PresetSelect
                  value={settings.preset}
                  onChange={(preset) => onChange({ ...settings, preset })}
                />
              </SettingRow>
              <Divider spacing={0} />
              <SpecialsSwitch
                checked={settings.monitorSpecials}
                onChange={(monitorSpecials) => onChange({ ...settings, monitorSpecials })}
              />
              <Divider spacing={0} />
            </>
          ) : null}
          {films ? (
            <>
              <SettingRow
                label={t('monitoring.minAvailability')}
                hint={t('monitoring.minAvailabilityHint')}
                block
              >
                <AvailabilitySelect
                  value={settings.minAvailability}
                  onChange={(minAvailability) => onChange({ ...settings, minAvailability })}
                />
              </SettingRow>
              <Divider spacing={0} />
            </>
          ) : null}
          <SettingRow label={t('monitoring.searchNow')} hint={t('monitoring.searchNowHint')}>
            <Switch
              checked={settings.searchNow}
              onCheckedChange={(searchNow) => onChange({ ...settings, searchNow })}
              label={t('monitoring.searchNow')}
            />
          </SettingRow>
        </Surface>
      </Disclosure.Panel>
    </Disclosure.Root>
  );
}
