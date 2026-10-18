import type { MonitorPreset } from '@kromatv/client/monitoring';
import { useT } from '@kromatv/ui';
import { Box, Button, Row, Surface, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { PresetSelect } from '#web/features/admin/monitoring-options';

export function BulkBar({
  count,
  shows,
  busy,
  onFollow,
  onUnfollow,
  onClear,
}: Readonly<{
  count: number;
  shows: boolean;
  busy: boolean;
  onFollow: (preset: MonitorPreset | undefined) => void;
  onUnfollow: () => void;
  onClear: () => void;
}>) {
  const t = useT();
  const [preset, setPreset] = useState<MonitorPreset | null>(null);
  return (
    <Surface tone="raised" radius="xl" pad="none" border="borderStrong">
      <Row wrap gap={12} align="center" px={16} py={12}>
        <Text variant="label">{t('monitoring.bulkPicked', { count })}</Text>
        {shows ? (
          <Box w={{ base: '100%', md: 230 }}>
            <PresetSelect value={preset} onChange={setPreset} disabled={busy} />
          </Box>
        ) : null}
        <Row gap={8} align="center" wrap>
          <Button
            size="sm"
            icon="radar"
            label={t('monitoring.bulkFollow')}
            onPress={() => onFollow(preset ?? undefined)}
            loading={busy}
            disabled={count === 0}
          />
          <Button
            size="sm"
            variant="dangerGhost"
            icon="radar-off"
            label={t('monitoring.bulkUnfollow')}
            onPress={onUnfollow}
            disabled={busy || count === 0}
          />
          <Button
            size="sm"
            variant="ghost"
            label={t('monitoring.bulkLeave')}
            onPress={onClear}
            disabled={busy}
          />
        </Row>
      </Row>
    </Surface>
  );
}
