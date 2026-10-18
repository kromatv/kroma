import type { MonitoredSummary } from '@kromatv/client/monitoring';
import type { MessageKey } from '@kromatv/i18n';
import { Table } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Badge, Box, Icon, Progress, Row, Text } from '@kromatv/ui/kit';
import { airStatusKey } from '#web/features/admin/monitoring-model';
import { Pill } from '#web/features/admin/pill';
import { kindMeta } from '#web/features/admin/pipeline-meta';
import { posterScrim } from '#web/shared/lib/art-styles';
import { Image } from '#web/shared/ui';

export function MonitoredRowView({
  title,
  onOpen,
}: Readonly<{ title: MonitoredSummary; onOpen: () => void }>) {
  const t = useT();
  const km = kindMeta(title.kind === 'show' ? 'series' : 'film');
  const status = airStatusKey(title.airStatus);
  return (
    <Table.Row onPress={onOpen}>
      <Table.Cell row gap={14}>
        <Box w={32} h={46} shrink={0} radius="xs" overflow="hidden">
          <Box fill style={posterScrim(title.title)} />
          <Image src={title.posterUrl} fit="cover" fill />
        </Box>
        <Box flex minW={0}>
          <Row gap={10} align="center" minW={0}>
            <Text variant="label" lines={1} minW={0}>
              {title.title}
            </Text>
            <Box shrink={0}>
              <Pill ink={km.color} bg={km.bg} variant="overline">
                {t(`pipeline.type.${km.typeKey}` as MessageKey)}
              </Pill>
            </Box>
          </Row>
          {title.year ? (
            <Text variant="meta" color="textDim" lines={1} mt={3}>
              {String(title.year)}
            </Text>
          ) : null}
        </Box>
      </Table.Cell>

      <Table.Cell gap={6}>
        <Text variant="meta" color="textDim">
          {t('monitoring.monitoredOf', {
            available: title.available,
            monitored: title.monitored,
          })}
        </Text>
        {title.monitored > 0 ? (
          <Progress
            value={Math.min(title.available, title.monitored) / title.monitored}
            thickness={3}
            color={title.missing === 0 ? 'success' : 'accent'}
          />
        ) : null}
      </Table.Cell>

      <Table.Cell row wrap gap={6}>
        {title.missing > 0 ? (
          <Badge tone="warning">{t('monitoring.missingCount', { count: title.missing })}</Badge>
        ) : null}
        {title.grabbed > 0 ? (
          <Badge tone="info">{t('monitoring.grabbedCount', { count: title.grabbed })}</Badge>
        ) : null}
        {title.missing === 0 && title.grabbed === 0 ? (
          <Badge tone="success">{t('monitoring.allHere')}</Badge>
        ) : null}
      </Table.Cell>

      <Table.Cell>
        <Text variant="meta" color="textMuted" lines={1}>
          {status ? t(status) : (title.airStatus ?? '')}
        </Text>
      </Table.Cell>

      <Table.Cell justify="flex-end">
        <Icon name="chevron-right" size={16} color="textMuted" />
      </Table.Cell>
    </Table.Row>
  );
}
