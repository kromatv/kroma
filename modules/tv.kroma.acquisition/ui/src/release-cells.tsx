// The three columns every release row carries, whatever the sweep that found it.
//
// The scored table and the free-text one differ in what they can say about a
// release -- one has a score and a target, the other only what the name parsed
// into -- but where it came from, how big it is and how many are seeding are the
// same three facts in the same three columns. They were written twice.

import { formatBytes } from '@kroma/core';
import { TABULAR, Table, useT } from '@kroma/module-sdk';
import { Icon, Row, Text } from '@kroma/ui/kit';

export function ReleaseFacts({
  indexerName,
  detailsUrl,
  sizeBytes,
  seeders,
}: Readonly<{
  indexerName: string;
  /** The tracker's own page for this release, when it has one. */
  detailsUrl: string | null;
  sizeBytes: number | null;
  seeders: number | null;
}>) {
  const t = useT();
  return (
    <>
      <Table.Cell wide>
        <Row gap={4}>
          <Text variant="meta" color="textDim" lines={1}>
            {indexerName}
          </Text>
          {detailsUrl ? (
            <a
              href={detailsUrl}
              target="_blank"
              rel="noreferrer"
              title={t('downloads.viewOnTracker')}
            >
              <Icon name="external-link" size={11} thickness={2} color="textDim" />
            </a>
          ) : null}
        </Row>
      </Table.Cell>
      <Table.Cell wide>
        <Text variant="meta" color="textDim" style={TABULAR}>
          {sizeBytes != null ? formatBytes(sizeBytes) : '—'}
        </Text>
      </Table.Cell>
      <Table.Cell wide>
        <Text variant="meta" color="success" style={TABULAR}>
          {seeders ?? '—'}
        </Text>
      </Table.Cell>
    </>
  );
}
