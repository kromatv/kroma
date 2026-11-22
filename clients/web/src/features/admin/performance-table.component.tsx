import type { MessageKey } from '@kromatv/i18n';
import { TABULAR } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import {
  EmptyState,
  type IconName,
  type SortColumn,
  Table,
  type TableColumn,
  Text,
} from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

/** A column of a Performance table, headed by a message. */
export interface PerfColumn extends TableColumn {
  labelKey: MessageKey;
}

interface PerfTableProps {
  columns: readonly PerfColumn[];
  labelKey: MessageKey;
  sort: readonly SortColumn[];
  onSortChange: (next: readonly SortColumn[]) => void;
  children: ReactNode;
}

/** The frame every Performance table shares: sortable headings, widths the
 *  reader can drag, and the rows the caller already ordered. */
export function PerfTable({
  columns,
  labelKey,
  sort,
  onSortChange,
  children,
}: Readonly<PerfTableProps>) {
  const t = useT();
  return (
    <Table.Root
      label={t(labelKey)}
      columns={columns}
      sort={sort}
      onSortChange={onSortChange}
      required
      resizable
    >
      <Table.Header>
        <Table.Row>
          {columns.map((column) => (
            <Table.Cell key={column.labelKey}>{t(column.labelKey)}</Table.Cell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>{children}</Table.Body>
    </Table.Root>
  );
}

/** What a Performance tab shows when its period measured nothing. */
export function PerfEmpty({ icon, labelKey }: Readonly<{ icon: IconName; labelKey: MessageKey }>) {
  const t = useT();
  return (
    <EmptyState.Root icon={icon}>
      <EmptyState.Title>{t(labelKey)}</EmptyState.Title>
    </EmptyState.Root>
  );
}

/** A figure in a Performance cell, in tabular digits so columns line up. */
export function PerfNumber({ children }: Readonly<{ children: string }>) {
  return (
    <Text variant="meta" style={TABULAR} lines={1}>
      {children}
    </Text>
  );
}
