import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Box, EmptyState, Row, Text } from '@kromatv/ui/kit';
import { FormatPills, QualityPill, ScorePill } from './judgement-pills';
import { reasonKey } from './release-verdict';
import type { JudgedFile } from './rules-schemas';

const COLUMNS: TableColumn[] = [{}, { width: 96 }, { width: 136 }, { width: 74 }];

export function TitleFilesTable({ files }: Readonly<{ files: readonly JudgedFile[] }>) {
  const t = useT();
  if (files.length === 0) {
    return (
      <EmptyState.Root icon="file-off">
        <EmptyState.Title>{t('acq.titleNoFiles')}</EmptyState.Title>
        <EmptyState.Hint>{t('acq.titleNoFilesHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }
  return (
    <Table.Root columns={COLUMNS} label={t('acq.titleFiles')}>
      <Table.Header>
        <Table.Column>{t('acq.colFile')}</Table.Column>
        <Table.Column>{t('requests.colEpisode')}</Table.Column>
        <Table.Column>{t('acq.colQuality')}</Table.Column>
        <Table.Column>{t('requests.colScore')}</Table.Column>
      </Table.Header>
      {files.map((file) => (
        <FileRow key={file.fileId} file={file} />
      ))}
    </Table.Root>
  );
}

function FileRow({ file }: Readonly<{ file: JudgedFile }>) {
  const t = useT();
  const allowed = file.evaluation.qualityRank != null;
  return (
    <Table.Row>
      <Table.Cell>
        <Box minW={0} gap={2}>
          <Text variant="meta" lines={1}>
            {file.relPath ?? file.fileId}
          </Text>
          <Row wrap gapX={10} align="center">
            {file.belowTarget ? (
              <Text variant="meta" color="accentText">
                {t('acq.belowTarget')}
              </Text>
            ) : null}
            {allowed ? null : (
              <Text variant="meta" color="dangerHover">
                {t(reasonKey('notAllowed'))}
              </Text>
            )}
            {file.release ? (
              <Text variant="meta" color="textDim" lines={1}>
                {file.release}
              </Text>
            ) : null}
          </Row>
          <FormatPills formats={file.evaluation.formats} />
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textDim">
          {unitLabel(file)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <QualityPill quality={file.evaluation.quality} allowed={allowed} />
      </Table.Cell>
      <Table.Cell>
        <ScorePill score={file.evaluation.formatScore} />
      </Table.Cell>
    </Table.Row>
  );
}

function unitLabel(file: JudgedFile): string {
  if (file.season == null) return '';
  const season = `S${String(file.season).padStart(2, '0')}`;
  if (file.episode == null) return season;
  const first = String(file.episode).padStart(2, '0');
  const last = file.episodeEnd == null ? null : String(file.episodeEnd).padStart(2, '0');
  return last && last !== first ? `${season}E${first}-E${last}` : `${season}E${first}`;
}
