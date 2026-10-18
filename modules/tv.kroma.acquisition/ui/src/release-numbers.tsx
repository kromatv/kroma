import type { ScoredReleaseView } from '@kromatv/client/requests';
import { TABULAR, useFormat } from '@kromatv/module-sdk';
import { Box, Icon, Row, Text } from '@kromatv/ui/kit';
import { BLANK } from './release-cells';

const SIZE_W = 76;
const SEEDERS_W = 56;

export function ReleaseNumbers({
  release,
  aligned,
}: Readonly<{
  release: ScoredReleaseView;
  aligned: boolean;
}>) {
  const fmt = useFormat();
  const seeding = (release.seeders ?? 0) > 0;
  return (
    <Row gap={16} align="center" pointerEvents="none">
      <Box w={aligned ? SIZE_W : undefined} align={aligned ? 'flex-end' : undefined}>
        <Text variant="meta" color="text" style={TABULAR}>
          {release.sizeBytes == null ? BLANK : fmt.bytes(release.sizeBytes)}
        </Text>
      </Box>
      <Row
        w={aligned ? SEEDERS_W : undefined}
        justify={aligned ? 'flex-end' : undefined}
        align="center"
        gap={3}
      >
        <Icon name="arrow-up" size={13} thickness={2.4} color={seeding ? 'success' : 'textDim'} />
        <Text variant="meta" color={seeding ? 'success' : 'textDim'} style={TABULAR}>
          {release.seeders ?? BLANK}
        </Text>
      </Row>
    </Row>
  );
}
