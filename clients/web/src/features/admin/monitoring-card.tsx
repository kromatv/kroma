import type {
  MinAvailability,
  MonitorBody,
  MonitoredSummary,
  MonitorPreset,
} from '@kromatv/client/monitoring';
import type { RequestKind } from '@kromatv/client/requests';
import { useT } from '@kromatv/ui';
import { Box, Button, confirm, Divider, Row, Surface, Switch, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  AvailabilitySelect,
  OptionRow,
  PresetSelect,
  usePresetLabel,
} from '#web/features/admin/monitoring-options';

export function MonitoringCard({
  kind,
  title,
  monitored,
  busy,
  onMonitor,
  onUnmonitor,
}: Readonly<{
  kind: RequestKind;
  title: string;
  monitored: MonitoredSummary | null;
  busy: boolean;
  onMonitor: (body: MonitorBody) => void;
  onUnmonitor: () => void;
}>) {
  const t = useT();
  const [preset, setPreset] = useState<MonitorPreset>('all');
  const [draftAvailability, setDraftAvailability] = useState<MinAvailability>('released');
  const presetLabel = usePresetLabel();
  const availability = monitored?.minAvailability ?? draftAvailability;
  const pickAvailability = (next: MinAvailability) => {
    setDraftAvailability(next);
    if (monitored) onMonitor({ minAvailability: next });
  };

  const applyPreset = async () => {
    const ok = await confirm({
      title: t('monitoring.applyConfirm', { preset: presetLabel(preset) }),
      message: t('monitoring.applyConfirmHint'),
      confirmLabel: t('monitoring.apply'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) onMonitor({ preset });
  };

  const stop = async () => {
    const ok = await confirm({
      title: t('monitoring.unfollowConfirm', { title }),
      message: t('monitoring.unfollowConfirmHint'),
      confirmLabel: t('monitoring.unfollow'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) onUnmonitor();
  };

  return (
    <Surface elevated radius="xl" pad="lg">
      <Text variant="overline" color="textDim" mb={14}>
        {t('monitoring.action')}
      </Text>
      <Box gap={16}>
        {monitored ? null : (
          <Box gap={2}>
            <Text variant="label">{t('monitoring.notMonitored')}</Text>
            <Text variant="meta" color="textDim">
              {t('monitoring.notMonitoredHint')}
            </Text>
          </Box>
        )}

        {kind === 'show' ? (
          <OptionRow label={t('monitoring.preset')} hint={t('monitoring.presetHint')}>
            <Row gap={8} align="center" wrap>
              <Box flex minW={180}>
                <PresetSelect value={preset} onChange={setPreset} disabled={busy} />
              </Box>
              {monitored ? (
                <Button
                  size="sm"
                  label={t('monitoring.apply')}
                  onPress={() => void applyPreset()}
                  loading={busy}
                />
              ) : null}
            </Row>
          </OptionRow>
        ) : null}

        {kind === 'movie' ? (
          <OptionRow
            label={t('monitoring.minAvailability')}
            hint={t('monitoring.minAvailabilityHint')}
          >
            <AvailabilitySelect value={availability} onChange={pickAvailability} disabled={busy} />
          </OptionRow>
        ) : null}

        {monitored && kind === 'show' ? (
          <OptionRow label={t('monitoring.newSeasons')} hint={t('monitoring.newSeasonsHint')}>
            <Switch
              checked={monitored.monitorNewSeasons}
              onCheckedChange={(next) => onMonitor({ monitorNewSeasons: next })}
              label={t('monitoring.newSeasons')}
              disabled={busy}
            />
          </OptionRow>
        ) : null}

        <Divider color="tint/6" />

        <Row wrap gap={10}>
          {monitored ? (
            <>
              <Button
                variant="glass"
                size="sm"
                icon="search"
                label={t('monitoring.searchMissing')}
                onPress={() => onMonitor({ searchNow: true })}
                loading={busy}
              />
              <Button
                variant="danger"
                size="sm"
                icon="eye-off"
                label={t('monitoring.unfollow')}
                onPress={() => void stop()}
                disabled={busy}
              />
            </>
          ) : (
            <Button
              size="sm"
              icon="eye"
              label={t('monitoring.follow')}
              onPress={() =>
                onMonitor(kind === 'show' ? { preset } : { minAvailability: availability })
              }
              loading={busy}
            />
          )}
        </Row>
      </Box>
    </Surface>
  );
}
