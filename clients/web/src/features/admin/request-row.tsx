// One request row in the admin queue: poster, title + type pill + seasons,
// requester, date, status chip, and quick approve/deny on pending rows.

import type { MediaRequest, MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Avatar, Box, Row, Text } from '@kroma/ui/kit';
import { Pill } from '#web/features/admin/pill';
import { kindMeta, posterGrad } from '#web/features/admin/pipeline-meta';
import { TABULAR, Table } from '#web/features/admin/table';
import { seasonsSummary } from '#web/shared/lib/request-status';
import { Image } from '#web/shared/ui';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';

function Poster({ req }: Readonly<{ req: MediaRequest }>) {
  return (
    <Box w={32} h={46} shrink={0} radius={4} overflow="hidden" shadow="card">
      <div style={{ position: 'absolute', inset: 0, background: posterGrad(req.title) }} />
      <Image src={req.posterUrl} fit="cover" fill />
    </Box>
  );
}

export function RequestRowView({
  req,
  canReview,
  onOpen,
  onApprove,
  onDeny,
}: Readonly<{
  req: MediaRequest;
  canReview: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onDeny: () => void;
}>) {
  const t = useT();
  const km = kindMeta(req.kind === 'show' ? 'series' : 'film');
  const seasons = seasonsSummary(req.seasons);
  const sub = [
    req.year ? String(req.year) : '',
    req.kind === 'show' ? (seasons ?? t('requests.allSeasons')) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Table.Row onPress={onOpen}>
      <Table.Cell row gap={14}>
        <Poster req={req} />
        <Box minW={0}>
          <Row gap={10}>
            <Text variant="label" lines={1}>
              {req.title}
            </Text>
            <Pill ink={km.color} bg={km.bg} variant="overline">
              {t(`pipeline.type.${km.typeKey}` as MessageKey)}
            </Pill>
          </Row>
          <Text variant="meta" color="textDim" lines={1} mt={3}>
            {sub}
          </Text>
        </Box>
      </Table.Cell>

      <Table.Cell wide row gap={10}>
        <Avatar name={req.requestedByName ?? '?'} size={26} circle shadow={false} />
        <Text variant="meta" color="textMuted" lines={1}>
          {req.requestedByName ?? t('requests.unknownUser')}
        </Text>
      </Table.Cell>

      <Table.Cell wide>
        <Text variant="meta" color="textDim" style={TABULAR}>
          {new Date(req.createdAt).toLocaleDateString()}
        </Text>
      </Table.Cell>

      <Table.Cell wide align="flex-start">
        <RequestStatusChip status={req.status} progress={req.progress} />
      </Table.Cell>

      <Table.Cell row gap={6} justify="flex-end">
        {canReview && req.status === 'pending' ? (
          <>
            <Table.Action
              tone="success"
              icon="check"
              label={t('requests.approve')}
              onPress={onApprove}
            />
            <Table.Action tone="danger" icon="x" label={t('requests.deny')} onPress={onDeny} />
          </>
        ) : null}
      </Table.Cell>
    </Table.Row>
  );
}
