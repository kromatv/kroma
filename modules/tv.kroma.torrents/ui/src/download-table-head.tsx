import { type TableHeading, useT } from '@kroma/module-sdk';
import { Table } from '@kroma/ui/kit';

export function DownloadTableHead({ headings }: Readonly<{ headings: TableHeading[] }>) {
  const t = useT();
  return (
    <Table.Header>
      <Table.Row>
        {headings.map(({ id, labelKey }) => (
          <Table.Cell key={id}>{labelKey ? t(labelKey) : null}</Table.Cell>
        ))}
      </Table.Row>
    </Table.Header>
  );
}
