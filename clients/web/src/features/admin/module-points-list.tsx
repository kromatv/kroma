// The extension-point graph for the admin Modules page: every point, who answers
// it and who calls it. Without it, a module that is installed, enabled and
// answering nothing looks exactly like one that is working.

import { Table } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Badge, Box, EmptyState, Row, Text } from '@kroma/ui/kit';
import { useMemo } from 'react';
import type { AdminModule } from '#web/features/admin/module-api';
import { type Point, pointGraph } from '#web/features/admin/module-points';

export function PointsList({
  modules,
  query,
}: Readonly<{ modules: AdminModule[] | null | undefined; query: string }>) {
  const t = useT();
  const needle = query.trim().toLowerCase();
  const points = useMemo(() => pointGraph(modules ?? []), [modules]);
  const shown = useMemo(
    () =>
      needle
        ? points.filter(
            (p) =>
              p.name.toLowerCase().includes(needle) ||
              p.answers.some((a) => a.name.toLowerCase().includes(needle)) ||
              p.callers.some((c) => c.name.toLowerCase().includes(needle)),
          )
        : points,
    [points, needle],
  );

  if (shown.length === 0) {
    return (
      <EmptyState.Root icon="apps">
        <EmptyState.Title>{t('admin.modulesPointsEmpty')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }

  return (
    <Box gap={12}>
      <Text variant="meta" color="textDim">
        {t('admin.modulesPointsHint')}
      </Text>
      <Table.Root columns="minmax(0, 1fr) 320px" narrow="minmax(0, 1fr)">
        {shown.map((p) => (
          <PointRow key={p.name} point={p} />
        ))}
      </Table.Root>
    </Box>
  );
}

function PointRow({ point }: Readonly<{ point: Point }>) {
  const t = useT();
  const callers = point.callers
    .map((c) => (c.instance ? `${c.name} (${c.instance})` : c.name))
    .join(', ');
  return (
    <Table.Row>
      <Table.Cell>
        <Box minW={0} gap={4}>
          <Row gap={8} align="center">
            <Text variant="label" lines={1}>
              {point.name}
            </Text>
            {point.unanswered && <Badge tone="danger">{t('admin.modulesPointUnanswered')}</Badge>}
          </Row>
          <Text variant="meta" color="textDim" lines={1}>
            {`${t('admin.modulesPointCalledBy')}: ${callers || t('admin.modulesPointNobody')}`}
          </Text>
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Row wrap gap={6} align="center" justify="flex-end">
          {point.answers.length > 0 ? (
            point.answers.map((a) => (
              <Badge
                key={`${a.moduleId}:${a.instance ?? ''}`}
                tone={a.live ? 'success' : 'neutral'}
              >
                {a.instance ? `${a.name} · ${a.instance}` : a.name}
              </Badge>
            ))
          ) : (
            <Text variant="meta" color="textDim">
              {t('admin.modulesPointNoAnswer')}
            </Text>
          )}
        </Row>
      </Table.Cell>
    </Table.Row>
  );
}
