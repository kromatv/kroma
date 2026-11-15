import type { DefaultAction } from '@kromatv/client/network';
import { useT } from '@kromatv/ui';
import { Box, Row, SegmentGroup, Surface, Text } from '@kromatv/ui/kit';

export function DefaultActionCard({
  value,
  onChange,
}: Readonly<{ value: DefaultAction; onChange: (next: DefaultAction) => void }>) {
  const t = useT();
  return (
    <Surface>
      <Row wrap gap={16} align="center">
        <Box flex minW={220} gap={3}>
          <Text variant="title">{t('network.defaultTitle')}</Text>
          <Text variant="meta" color="textDim">
            {t('network.defaultHint')}
          </Text>
        </Box>
        <SegmentGroup.Root<DefaultAction>
          label={t('network.defaultTitle')}
          value={value}
          onValueChange={onChange}
        >
          <SegmentGroup.Item value="allow">
            <SegmentGroup.Label>{t('network.defaultAllow')}</SegmentGroup.Label>
          </SegmentGroup.Item>
          <SegmentGroup.Item value="block">
            <SegmentGroup.Label>{t('network.defaultBlock')}</SegmentGroup.Label>
          </SegmentGroup.Item>
        </SegmentGroup.Root>
      </Row>
    </Surface>
  );
}
