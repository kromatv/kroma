import type { MonitorPreset } from '@kromatv/client/monitoring';
import { useFormat, useT } from '@kromatv/ui';
import { Box, SelectionBar } from '@kromatv/ui/kit';
import { useState } from 'react';
import { PresetSelect } from '#web/features/admin/monitoring-options';

export function BulkBar({
  count,
  matching,
  everything,
  shows,
  busy,
  onFollow,
  onUnfollow,
  onSelectAll,
  onClear,
}: Readonly<{
  count: number;
  matching: number;
  everything: boolean;
  shows: boolean;
  busy: boolean;
  onFollow: (preset: MonitorPreset | undefined) => void;
  onUnfollow: () => void;
  onSelectAll: () => void;
  onClear: () => void;
}>) {
  const t = useT();
  const fmt = useFormat();
  const [preset, setPreset] = useState<MonitorPreset | null>(null);
  return (
    <SelectionBar.Root count={count} onClear={onClear} label={t('monitoring.bulkLabel')}>
      <SelectionBar.Clear label={t('monitoring.bulkClear')} />
      <SelectionBar.Status>
        {t('monitoring.bulkPicked', { count, amount: fmt.decimal(count, 0) })}
      </SelectionBar.Status>
      {everything ? null : (
        <SelectionBar.SelectAll
          label={t('monitoring.bulkSelectAll', { total: fmt.decimal(matching, 0) })}
          onPress={onSelectAll}
        />
      )}
      <SelectionBar.Actions label={t('monitoring.bulkMore')}>
        {shows ? (
          <Box w={{ base: 190, md: 230 }}>
            <PresetSelect value={preset} onChange={setPreset} disabled={busy} />
          </Box>
        ) : null}
        <SelectionBar.Item
          icon="radar"
          tone="accent"
          label={t('monitoring.bulkFollow')}
          loading={busy}
          onPress={() => onFollow(preset ?? undefined)}
        />
        <SelectionBar.Item
          icon="radar-off"
          tone="danger"
          label={t('monitoring.bulkUnfollow')}
          disabled={busy}
          onPress={onUnfollow}
        />
      </SelectionBar.Actions>
    </SelectionBar.Root>
  );
}
