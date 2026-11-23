import type { PerfOverview, PerfWindow } from '@kromatv/client/performance';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Button, Row, SegmentGroup, Spacer, Switch, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { PERF_WINDOWS } from '#web/features/admin/performance-tabs';
import { useCap } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { saveFile } from '#web/shared/lib/save-file';

const WINDOW_LABEL: Readonly<Record<PerfWindow, MessageKey>> = {
  '1h': 'perf.window1h',
  '24h': 'perf.window24h',
  '7d': 'perf.window7d',
  '30d': 'perf.window30d',
};

function isWindow(value: string): value is PerfWindow {
  const windows: readonly string[] = PERF_WINDOWS;
  return windows.includes(value);
}

function ExportButton({ window }: Readonly<{ window: PerfWindow }>) {
  const t = useT();
  const { client } = useAuth();
  const [busy, setBusy] = useState(false);
  const save = () => {
    setBusy(true);
    void client.performance
      .export(window)
      .then((blob) => saveFile(blob, `kroma-performance-${window}.jsonl`))
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  return (
    <Button
      variant="glass"
      size="sm"
      icon="download"
      label={t('perf.exportJsonl')}
      onPress={save}
      loading={busy}
    />
  );
}

function MeasuringSwitch({
  overview,
  onSwitched,
}: Readonly<{ overview: PerfOverview; onSwitched: () => void }>) {
  const t = useT();
  const { client } = useAuth();
  const canSwitch = useCap('settings.manage') && overview.switchable;
  const flip = ({ enabled }: { enabled: boolean }) => {
    void client.performance.setEnabled(enabled).then(onSwitched);
  };
  return (
    <Row gap={8}>
      <Text variant="meta" color="textMuted">
        {t('perf.enabled')}
      </Text>
      <Switch
        checked={overview.enabled}
        onCheckedChange={(on) => flip({ enabled: on })}
        disabled={!canSwitch}
        label={t('perf.enabled')}
      />
    </Row>
  );
}

interface ToolbarProps {
  overview: PerfOverview | null;
  window: PerfWindow;
  onWindow: (next: PerfWindow) => void;
  onSwitched: () => void;
}

function WindowPicker({
  window,
  onWindow,
}: Readonly<{ window: PerfWindow; onWindow: (next: PerfWindow) => void }>) {
  const t = useT();
  return (
    <SegmentGroup.Root
      label={t('perf.window')}
      value={window}
      onValueChange={(next) => isWindow(next) && onWindow(next)}
    >
      {PERF_WINDOWS.map((one) => (
        <SegmentGroup.Item key={one} value={one}>
          <SegmentGroup.Label>{t(WINDOW_LABEL[one])}</SegmentGroup.Label>
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}

/** The period, the export, and the switch that turns measuring on or off. */
export function PerfToolbar({ overview, window, onWindow, onSwitched }: Readonly<ToolbarProps>) {
  return (
    <Row wrap gap={12} mt={8} mb={16}>
      <WindowPicker window={window} onWindow={onWindow} />
      <ExportButton window={window} />
      <Spacer />
      {overview ? <MeasuringSwitch overview={overview} onSwitched={onSwitched} /> : null}
    </Row>
  );
}
