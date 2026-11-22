import type { PlayEntry } from '@kromatv/client/admin';
import type { MessageKey } from '@kromatv/i18n';
import { TABULAR } from '@kromatv/module-sdk';
import { useFormat, useT } from '@kromatv/ui';
import { Box, EmptyState, type SortColumn, Table, Text } from '@kromatv/ui/kit';
import type { ComponentType } from 'react';
import {
  type HistoryColumn,
  kindKey,
  type TitleLines,
  titleLines,
  titlePage,
  watchedTime,
} from '#web/features/admin/history-columns';
import type { HistorySort } from '#web/features/admin/history-query';
import { Pill } from '#web/features/admin/pill.component';
import { RouteLink } from '#web/shared/ui/route-link.component';

const ABSENT = '-';

interface CellProps {
  play: PlayEntry;
}

function UserCell({ play }: Readonly<CellProps>) {
  const t = useT();
  return (
    <Box row align="center" gap={8} wrap minW={0}>
      <Text variant="label" lines={1}>
        {play.username}
      </Text>
      {play.importedFrom ? (
        <Pill ink="textMuted" bg="tint/6" variant="overline">
          {t('admin.historyImported')}
        </Pill>
      ) : null}
    </Box>
  );
}

function KindCell({ play }: Readonly<CellProps>) {
  const t = useT();
  return (
    <Text variant="meta" color="textMuted" lines={1}>
      {t(kindKey(play.kind))}
    </Text>
  );
}

function TitleFace({ lead, detail }: Readonly<TitleLines>) {
  return (
    <Box minW={0}>
      <Text variant="meta" lines={1}>
        {lead}
      </Text>
      {detail ? (
        <Text variant="meta" color="textDim" lines={1}>
          {detail}
        </Text>
      ) : null}
    </Box>
  );
}

function TitleCell({ play }: Readonly<CellProps>) {
  return <TitleFace {...titleLines(play)} />;
}

function usePlayer(play: PlayEntry): string {
  const t = useT();
  const server = play.importedFrom?.name;
  if (!play.importedFrom) {
    return play.player ?? ABSENT;
  }
  return server ? t('admin.historyFrom', { name: server }) : t('admin.historyFromUnnamed');
}

function PlayerCell({ play }: Readonly<CellProps>) {
  return (
    <Text variant="meta" color="textMuted" lines={1}>
      {usePlayer(play)}
    </Text>
  );
}

function PlatformCell({ play }: Readonly<CellProps>) {
  const t = useT();
  const unknown = play.importedFrom ? t('admin.historyUnknown') : ABSENT;
  return (
    <Text variant="meta" color="textDim" lines={1}>
      {play.device ?? unknown}
    </Text>
  );
}

function WatchedCell({ play }: Readonly<CellProps>) {
  const t = useT();
  const fmt = useFormat();
  const time = watchedTime(play);
  if (time.kind === 'unknown') {
    return (
      <Text variant="meta" color="textDim" lines={1}>
        {t('admin.historyUnknown')}
      </Text>
    );
  }
  return (
    <TitleFace
      lead={fmt.duration(time.ms)}
      detail={time.kind === 'runtime' ? t('admin.historyRuntime') : null}
    />
  );
}

function WhenCell({ play }: Readonly<CellProps>) {
  const fmt = useFormat();
  return (
    <Text variant="meta" color="textDim" style={TABULAR}>
      {fmt.stamp(play.endedAt * 1000) ?? ABSENT}
    </Text>
  );
}

const CELLS: Record<HistorySort, ComponentType<CellProps>> = {
  username: UserCell,
  kind: KindCell,
  title: TitleCell,
  player: PlayerCell,
  device: PlatformCell,
  endedAt: WhenCell,
  watchedMs: WatchedCell,
};

interface HistoryRowProps extends CellProps {
  columns: readonly HistoryColumn[];
}

function HistoryRow({ play, columns }: Readonly<HistoryRowProps>) {
  const cells = columns.map((column) => {
    const Cell = CELLS[column.column];
    return (
      <Table.Cell key={column.column}>
        <Cell play={play} />
      </Table.Cell>
    );
  });
  const goes = titlePage(play);
  if (!goes) {
    return <Table.Row>{cells}</Table.Row>;
  }
  return (
    <Table.Row asChild>
      {goes.page === 'show' ? (
        <RouteLink to="/shows/$id" params={{ id: goes.id }}>
          {cells}
        </RouteLink>
      ) : (
        <RouteLink to="/movies/$id" params={{ id: goes.id }}>
          {cells}
        </RouteLink>
      )}
    </Table.Row>
  );
}

interface HistoryTableProps {
  columns: readonly HistoryColumn[];
  plays: readonly PlayEntry[];
  sort: readonly SortColumn[];
  onSortChange: (next: readonly SortColumn[]) => void;
  emptyKey: MessageKey;
  loaded: boolean;
}

export function HistoryTable({
  columns,
  plays,
  sort,
  onSortChange,
  emptyKey,
  loaded,
}: Readonly<HistoryTableProps>) {
  const t = useT();
  if (loaded && plays.length === 0) {
    return (
      <EmptyState.Root icon="history">
        <EmptyState.Title>{t(emptyKey)}</EmptyState.Title>
      </EmptyState.Root>
    );
  }
  return (
    <Table.Root
      label={t('admin.historyScreen')}
      columns={columns}
      required
      sort={sort}
      onSortChange={onSortChange}
      resizable
      autoSaveId={`kroma:admin-history:${columns.map((column) => column.column).join(',')}`}
    >
      <Table.Header>
        <Table.Row>
          {columns.map((column) => (
            <Table.Cell key={column.column}>{t(column.labelKey)}</Table.Cell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {plays.map((play) => (
          <HistoryRow key={play.id} play={play} columns={columns} />
        ))}
      </Table.Body>
    </Table.Root>
  );
}
