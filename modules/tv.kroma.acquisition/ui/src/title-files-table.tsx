import type { RequestKind } from '@kromatv/client/requests';
import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Box, EmptyState, Row, Text, useBreakpoint } from '@kromatv/ui/kit';
import { FormatPills, QualityPill, ScorePill } from './judgement-pills';
import type { JudgedFile } from './judgement-schemas';
import { belowReason, useBelowReasonText } from './quality-target';
import { reasonKey } from './release-verdict';
import type { QualityProfile } from './rules-schemas';

const SHOW_COLUMNS: TableColumn[] = [
  { min: 200 },
  { width: 110, from: 'md' },
  { width: 124 },
  { width: 70 },
];
const MOVIE_COLUMNS: TableColumn[] = [{ min: 200 }, { width: 124 }, { width: 70 }];

export function TitleFilesTable({
  kind,
  files,
  profile,
}: Readonly<{
  kind: RequestKind;
  files: readonly JudgedFile[];
  profile: QualityProfile | undefined;
}>) {
  const t = useT();
  if (files.length === 0) {
    return (
      <EmptyState.Root icon="file-off">
        <EmptyState.Title>{t('acq.titleNoFiles')}</EmptyState.Title>
        <EmptyState.Hint>{t('acq.titleNoFilesHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }
  const show = kind === 'show';
  return (
    <Table.Root columns={show ? SHOW_COLUMNS : MOVIE_COLUMNS} label={t('acq.titleFiles')}>
      <Table.Header>
        <Table.Column>{t('acq.colFile')}</Table.Column>
        {show ? <Table.Column>{t('requests.colEpisode')}</Table.Column> : null}
        <Table.Column>{t('acq.colQuality')}</Table.Column>
        <Table.Column>{t('requests.colScore')}</Table.Column>
      </Table.Header>
      {files.map((file) => (
        <FileRow key={file.fileId} file={file} show={show} profile={profile} />
      ))}
    </Table.Root>
  );
}

function FileRow({
  file,
  show,
  profile,
}: Readonly<{ file: JudgedFile; show: boolean; profile: QualityProfile | undefined }>) {
  const t = useT();
  const reasonText = useBelowReasonText();
  const unit = unitLabel(file);
  const allowed = file.evaluation.qualityRank != null;
  const narrow = useBreakpoint() === 'base';
  const why = file.belowTarget ? reasonText(belowReason(profile, file.evaluation)) : null;
  return (
    <Table.Row>
      <Table.Cell>
        <Box minW={0} gap={2}>
          <Text variant="meta" lines={1}>
            {fileName(file)}
          </Text>
          <Row wrap gapX={10} align="center">
            {narrow && unit ? (
              <Text variant="meta" color="info">
                {unit}
              </Text>
            ) : null}
            {why ? (
              <Text variant="meta" color="accentText">
                {why}
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
      {show ? (
        <Table.Cell>
          <Text variant="meta" color="textDim">
            {unit}
          </Text>
        </Table.Cell>
      ) : null}
      <Table.Cell>
        <QualityPill quality={file.evaluation.quality} allowed={allowed} />
      </Table.Cell>
      <Table.Cell>
        <ScorePill score={file.evaluation.formatScore} />
      </Table.Cell>
    </Table.Row>
  );
}

function fileName(file: JudgedFile): string {
  const path = file.relPath ?? file.fileId;
  return path.split('/').pop() || path;
}

function unitLabel(file: JudgedFile): string {
  if (file.season == null) return '';
  const season = `S${String(file.season).padStart(2, '0')}`;
  if (file.episode == null) return season;
  const first = String(file.episode).padStart(2, '0');
  const last = file.episodeEnd == null ? null : String(file.episodeEnd).padStart(2, '0');
  return last && last !== first ? `${season}E${first}-E${last}` : `${season}E${first}`;
}
