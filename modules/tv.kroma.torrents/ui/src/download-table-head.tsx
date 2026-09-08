import { type TableHeading, useT } from '@kromatv/module-sdk';
import { Table } from '@kromatv/ui/kit';

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
