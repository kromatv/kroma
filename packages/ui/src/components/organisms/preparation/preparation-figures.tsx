import type { Arrival } from '@kromatv/core';
import { Box, Row } from '#ui/components/atoms/box';
import { Progress } from '#ui/components/atoms/progress';
import { Text } from '#ui/components/atoms/text';
import { ArrivalMap } from '#ui/components/molecules/arrival-map';
import { useT } from '#ui/services/i18n';

function Readout({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Box gap={2} align="center" minW={92}>
      <Text variant="label" color="white">
        {value}
      </Text>
      <Text variant="meta" color="white/45">
        {label}
      </Text>
    </Box>
  );
}

export function PreparationFigures({ arrival }: Readonly<{ arrival: Arrival }>) {
  const t = useT();
  return (
    <Box gap={16} w="100%">
      <Progress
        value={arrival.progress}
        waiting={arrival.rate?.bps === 0}
        label={t('requests.watchStatDownloaded')}
      />
      <Row wrap gap={24} justify="center">
        {arrival.readings.map((reading) => (
          <Readout key={reading.key} label={reading.label} value={reading.text} />
        ))}
      </Row>
      <ArrivalMap
        slices={arrival.slices}
        arriving={arrival.arriving}
        label={arrival.mapLabel ?? undefined}
      />
    </Box>
  );
}
