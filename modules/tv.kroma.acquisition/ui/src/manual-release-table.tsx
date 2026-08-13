// Free-text sweep results. No score column: nothing here was scored, because
// nothing here has a target to be scored against. What the row carries instead
// is what the parser read off the name, which is what the grab will import it as.

import { Table, useT } from '@kroma/module-sdk';
import { Box, EmptyState, Row, Text } from '@kroma/ui/kit';
import { ReleaseFacts } from './release-cells';
import type { ManualReleaseView } from './schemas';

const COLUMNS = 'minmax(0,1fr) 150px 92px 84px 44px';

export function ManualReleaseTable({
  releases,
  canGrab,
  grabbing,
  onGrab,
}: Readonly<{
  releases: ManualReleaseView[];
  canGrab: boolean;
  /** The guid of the row being grabbed, so only that row is busy. */
  grabbing: string | null;
  onGrab: (release: ManualReleaseView) => void;
}>) {
  const t = useT();
  if (releases.length === 0) {
    return (
      <Box py={20}>
        <EmptyState.Root icon="search">
          <EmptyState.Title>{t('requests.noReleases')}</EmptyState.Title>
        </EmptyState.Root>
      </Box>
    );
  }
  return (
    <Table.Root columns={COLUMNS}>
      <Table.Header>
        <Table.Column>{t('requests.colRelease')}</Table.Column>
        <Table.Column wide>{t('requests.colIndexer')}</Table.Column>
        <Table.Column wide>{t('requests.colSize')}</Table.Column>
        <Table.Column wide>{t('requests.colSeeders')}</Table.Column>
        <Table.Cell />
      </Table.Header>
      {releases.map((r) => (
        <ManualRow
          key={`${r.indexerId}-${r.guid}`}
          r={r}
          canGrab={canGrab}
          busy={grabbing != null}
          onGrab={onGrab}
        />
      ))}
    </Table.Root>
  );
}

function ManualRow({
  r,
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  r: ManualReleaseView;
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ManualReleaseView) => void;
}>) {
  const t = useT();
  const grabbable = Boolean(r.downloadUrl || r.detailsUrl);
  const target = parsedTarget(r);
  return (
    <Table.Row>
      <Table.Cell>
        <Text variant="meta" lines={1}>
          {r.title}
        </Text>
        <Row wrap gapX={10} mt={2}>
          {target ? (
            <Text variant="meta" color="info">
              {target}
            </Text>
          ) : null}
          {r.resolution ? (
            <Text variant="meta" color="textDim">
              {r.resolution}
            </Text>
          ) : null}
          {r.codec ? (
            <Text variant="meta" color="hdr">
              {r.codec}
            </Text>
          ) : null}
        </Row>
      </Table.Cell>
      <ReleaseFacts
        indexerName={r.indexerName}
        detailsUrl={r.detailsUrl}
        sizeBytes={r.sizeBytes}
        seeders={r.seeders}
      />
      <Table.Cell>
        {canGrab && grabbable ? (
          <Table.Action
            tone="accent"
            icon="download"
            label={t('requests.grab')}
            disabled={busy}
            onPress={() => onGrab(r)}
          />
        ) : null}
      </Table.Cell>
    </Table.Row>
  );
}

/** `S03E07` / `S03` / null for anything the parser read as a film. */
function parsedTarget(r: ManualReleaseView): string | null {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (r.season == null) return null;
  if (r.fullSeason || r.episode == null) return `S${pad(r.season)}`;
  return `S${pad(r.season)}E${pad(r.episode)}`;
}
