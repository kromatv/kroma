// The three columns every release row carries, whatever the sweep that found it.
//
// The scored table and the free-text one differ in what they can say about a
// release -- one has a score and a target, the other only what the name parsed
// into -- but where it came from, how big it is and how many are seeding are the
// same three facts in the same three columns. They were written twice.

import { TABULAR, Table, useFormat, useT } from '@kromatv/module-sdk';
import { Icon, Row, Text } from '@kromatv/ui/kit';

/** What a numeric cell shows when the indexer gave no number. */
export const BLANK = '-';

/** The indexer a release came from, linked to the tracker's page for it when
 *  the indexer gave one. */
export function IndexerName({
  name,
  detailsUrl,
}: Readonly<{ name: string; detailsUrl: string | null }>) {
  const t = useT();
  const label = (
    <Text variant="meta" color="textDim" lines={1}>
      {name}
    </Text>
  );
  if (!detailsUrl) return label;
  return (
    <a href={detailsUrl} target="_blank" rel="noreferrer" title={t('downloads.viewOnTracker')}>
      <Row gap={4} align="center">
        {label}
        <Icon name="external-link" size={11} thickness={2} color="textDim" />
      </Row>
    </a>
  );
}

export function IndexerCell({
  indexerName,
  detailsUrl,
}: Readonly<{
  indexerName: string;
  /** The tracker's own page for this release, when it has one. */
  detailsUrl: string | null;
}>) {
  const t = useT();
  return (
    <Table.Cell>
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
  );
}

export function SizeCell({ sizeBytes }: Readonly<{ sizeBytes: number | null }>) {
  const fmt = useFormat();
  return (
    <Table.Cell>
      <Text variant="meta" color="textDim" style={TABULAR}>
        {sizeBytes != null ? fmt.bytes(sizeBytes) : BLANK}
      </Text>
    </Table.Cell>
  );
}

export function SeedersCell({ seeders }: Readonly<{ seeders: number | null }>) {
  return (
    <Table.Cell>
      <Text variant="meta" color="success" style={TABULAR}>
        {seeders ?? BLANK}
      </Text>
    </Table.Cell>
  );
}
