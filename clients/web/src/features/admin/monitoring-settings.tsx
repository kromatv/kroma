import type { MinAvailability, MonitorBody, MonitoredSummary } from '@kromatv/client/monitoring';
import type { RequestKind } from '@kromatv/client/requests';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, confirm, Divider, Row, Surface, Switch } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  AvailabilitySelect,
  PresetSelect,
  SettingRow,
  usePresetLabel,
} from '#web/features/admin/monitoring-options';

export function MonitoringSettings({
  kind,
  monitored,
  busy,
  onMonitor,
}: Readonly<{
  kind: RequestKind;
  monitored: MonitoredSummary | null;
  busy: boolean;
  onMonitor: (body: MonitorBody) => void;
}>) {
  const t = useT();
  if (!monitored) {
    return (
      <Callout.Root tone="accent" icon="eye-off">
        <Callout.Title>{t('monitoring.notMonitored')}</Callout.Title>
        <Callout.Detail>{t('monitoring.notMonitoredHint')}</Callout.Detail>
      </Callout.Root>
    );
  }
  return (
    <Surface pad="none" radius="xl" border="border" overflow="hidden">
      {kind === 'show' ? (
        <ShowSettings monitored={monitored} busy={busy} onMonitor={onMonitor} />
      ) : (
        <MovieSettings monitored={monitored} busy={busy} onMonitor={onMonitor} />
      )}
    </Surface>
  );
}

function ShowSettings({
  monitored,
  busy,
  onMonitor,
}: Readonly<{
  monitored: MonitoredSummary;
  busy: boolean;
  onMonitor: (body: MonitorBody) => void;
}>) {
  const t = useT();
  const [preset, setPreset] = useState<MonitorBody['preset']>('all');
  const presetLabel = usePresetLabel();

  const apply = async () => {
    if (!preset) return;
    const ok = await confirm({
      title: t('monitoring.applyConfirm', { preset: presetLabel(preset) }),
      message: t('monitoring.applyConfirmHint'),
      confirmLabel: t('monitoring.apply'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) onMonitor({ preset });
  };

  return (
    <>
      <SettingRow label={t('monitoring.preset')} hint={t('monitoring.presetHint')}>
        <Row gap={8} align="center" justify="flex-end" wrap>
          <Box flex minW={180} maxW={260}>
            <PresetSelect value={preset ?? 'all'} onChange={setPreset} disabled={busy} />
          </Box>
          <Button
            variant="glass"
            size="sm"
            label={t('monitoring.apply')}
            onPress={() => void apply()}
            loading={busy}
          />
        </Row>
      </SettingRow>
      <Divider spacing={0} />
      <SettingRow label={t('monitoring.newSeasons')} hint={t('monitoring.newSeasonsHint')}>
        <Switch
          checked={monitored.monitorNewSeasons}
          onCheckedChange={(next) => onMonitor({ monitorNewSeasons: next })}
          label={t('monitoring.newSeasons')}
          disabled={busy}
        />
      </SettingRow>
    </>
  );
}

function MovieSettings({
  monitored,
  busy,
  onMonitor,
}: Readonly<{
  monitored: MonitoredSummary;
  busy: boolean;
  onMonitor: (body: MonitorBody) => void;
}>) {
  const t = useT();
  const pick = (minAvailability: MinAvailability) => onMonitor({ minAvailability });
  return (
    <SettingRow label={t('monitoring.minAvailability')} hint={t('monitoring.minAvailabilityHint')}>
      <Box w="100%" maxW={260}>
        <AvailabilitySelect value={monitored.minAvailability} onChange={pick} disabled={busy} />
      </Box>
    </SettingRow>
  );
}
