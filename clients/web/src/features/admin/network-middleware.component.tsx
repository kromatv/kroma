import type { Middleware } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  EmptyState,
  IconButton,
  Row,
  Switch,
  Table,
  type TableColumn,
  Text,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { usePoll } from '#web/features/admin/hooks';
import { useCallerName } from '#web/features/admin/network-callers.hook';
import { NetworkLoadFailed } from '#web/features/admin/network-load-failed.component';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const MIDDLEWARE_POLL_MS = 15000;

interface MiddlewareColumn extends TableColumn {
  labelKey: MessageKey | null;
}

const COLUMNS: readonly MiddlewareColumn[] = [
  { labelKey: 'network.colOrder', width: 48 },
  { labelKey: 'network.colOwner', flex: 1.4, min: 160 },
  { labelKey: 'network.middlewareRequired', width: 112 },
  { labelKey: null, width: 96, align: 'end' },
];

/** The list with the middleware at `from` moved by `offset`, or `null` when
 * that would take it off either end. */
export function moved(list: readonly Middleware[], from: number, offset: -1 | 1) {
  const to = from + offset;
  const one = list[from];
  if (!one || to < 0 || to >= list.length) {
    return null;
  }
  const rest = list.filter((_, index) => index !== from);
  return [...rest.slice(0, to), one, ...rest.slice(to)];
}

function skippedText(one: Middleware, t: ReturnType<typeof useT>): string | null {
  if (one.skipped === 0) {
    return null;
  }
  return one.skipped === 1
    ? t('network.middlewareSkippedOnce')
    : t('network.middlewareSkipped', { count: one.skipped });
}

export function NetworkMiddleware() {
  const t = useT();
  const { client } = useAuth();
  const callerName = useCallerName();
  const [saveFailed, setSaveFailed] = useState(false);
  const { data, failed, error, reload } = usePoll(
    ['admin', 'network', 'middleware'],
    () => client.network.middleware(),
    MIDDLEWARE_POLL_MS,
  );

  if (failed && data === null) {
    return <NetworkLoadFailed error={error} />;
  }
  if (data === null) {
    return <TableSkeleton rows={3} />;
  }
  if (data.middleware.length === 0) {
    return (
      <EmptyState.Root icon="filter">
        <EmptyState.Title>{t('network.middlewareEmpty')}</EmptyState.Title>
        <EmptyState.Hint>{t('network.middlewareEmptyHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }

  const save = async (next: readonly Middleware[]) => {
    try {
      await client.network.saveMiddleware({
        middleware: next.map(({ module, required }) => ({ module, required })),
      });
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
    await reload();
  };
  const list = data.middleware;

  return (
    <>
      <Text variant="meta" color="textMuted" mb={16}>
        {t('network.middlewareIntro')}
      </Text>
      {saveFailed ? (
        <Text variant="meta" color="danger" mb={12}>
          {t('network.middlewareSaveFailed')}
        </Text>
      ) : null}
      <Table.Root label={t('network.tabMiddleware')} columns={COLUMNS}>
        <Table.Header>
          <Table.Row>
            {COLUMNS.map((column, index) => (
              <Table.Cell key={column.labelKey ?? index}>
                {column.labelKey ? t(column.labelKey) : ''}
              </Table.Cell>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {list.map((one, index) => {
            const name = callerName(one.module);
            const skipped = skippedText(one, t);
            const move = (offset: -1 | 1) => {
              const next = moved(list, index, offset);
              if (next) {
                void save(next);
              }
            };
            return (
              <Table.Row key={one.module}>
                <Table.Cell>
                  <Text variant="meta" color="textMuted">
                    {index + 1}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Box minW={0}>
                    <Row gap={8}>
                      <Text variant="label" lines={1}>
                        {name}
                      </Text>
                      {one.answering ? null : (
                        <Badge tone="warning">{t('network.middlewareSilent')}</Badge>
                      )}
                    </Row>
                    {skipped ? (
                      <Text variant="meta" color="textDim" mt={2}>
                        {skipped}
                      </Text>
                    ) : null}
                  </Box>
                </Table.Cell>
                <Table.Cell>
                  <Switch
                    checked={one.required}
                    onCheckedChange={(required) =>
                      void save(list.map((kept) => (kept === one ? { ...one, required } : kept)))
                    }
                    label={t('network.middlewareRequiredHint', { module: name })}
                  />
                </Table.Cell>
                <Table.Cell>
                  <Row gap={2}>
                    <IconButton
                      variant="ghost"
                      control="sm"
                      icon="arrow-up"
                      label={t('network.middlewareUp', { module: name })}
                      disabled={index === 0}
                      onPress={() => move(-1)}
                    />
                    <IconButton
                      variant="ghost"
                      control="sm"
                      icon="arrow-down"
                      label={t('network.middlewareDown', { module: name })}
                      disabled={index === list.length - 1}
                      onPress={() => move(1)}
                    />
                  </Row>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </>
  );
}
