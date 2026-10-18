import type { RequestKind } from '@kromatv/client/requests';
import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Badge, type BadgeTone, Box, EmptyState, Row, Text, useBreakpoint } from '@kromatv/ui/kit';
import { QualityPill } from './judgement-pills';
import type { Evaluation, JudgedFile } from './judgement-schemas';
import { type QualityGoal, shortfallsOf } from './quality-target';
import { useShortfallText } from './use-goal-text';

const SHOW_COLUMNS: TableColumn[] = [
  { min: 160 },
  { width: 100, from: 'md' },
  { width: 210, from: 'md' },
  { min: 150 },
];
const MOVIE_COLUMNS: TableColumn[] = [{ min: 160 }, { width: 210, from: 'md' }, { min: 150 }];

type FileVerdict = 'reached' | 'below' | 'kept';

const VERDICT_TONE: Record<FileVerdict, BadgeTone> = {
  reached: 'success',
  below: 'warning',
  kept: 'neutral',
};

export function TitleFilesTable({
  kind,
  files,
  goal,
}: Readonly<{
  kind: RequestKind;
  files: readonly JudgedFile[];
  goal: QualityGoal | null;
}>) {
  const t = useT();
  if (files.length === 0) {
    return (
      <EmptyState.Root icon="file-off">
        <EmptyState.Title>{t('acq.titleNoFiles')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }
  const show = kind === 'show';
  return (
    <Table.Root columns={show ? SHOW_COLUMNS : MOVIE_COLUMNS} label={t('acq.titleFiles')}>
      <Table.Header>
        <Table.Column>{t('acq.colFile')}</Table.Column>
        {show ? <Table.Column>{t('requests.colEpisode')}</Table.Column> : null}
        <Table.Column>{t('acq.colHas')}</Table.Column>
        <Table.Column>{t('requests.colState')}</Table.Column>
      </Table.Header>
      {files.map((file) => (
        <FileRow key={file.fileId} file={file} show={show} goal={goal} />
      ))}
    </Table.Root>
  );
}

function FileRow({
  file,
  show,
  goal,
}: Readonly<{ file: JudgedFile; show: boolean; goal: QualityGoal | null }>) {
  const unit = unitLabel(file);
  const narrow = useBreakpoint() === 'base';
  return (
    <Table.Row>
      <Table.Cell>
        <Box minW={0} gap={4}>
          <Text variant="meta" lines={1}>
            {fileName(file)}
          </Text>
          {file.release ? (
            <Text variant="meta" color="textDim" lines={1}>
              {file.release}
            </Text>
          ) : null}
          {narrow ? (
            <Row wrap gap={6} align="center">
              {unit ? (
                <Text variant="meta" color="info">
                  {unit}
                </Text>
              ) : null}
              <Holding evaluation={file.evaluation} />
            </Row>
          ) : null}
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
        <Holding evaluation={file.evaluation} />
      </Table.Cell>
      <Table.Cell>
        <Verdict file={file} goal={goal} />
      </Table.Cell>
    </Table.Row>
  );
}

function Holding({ evaluation }: Readonly<{ evaluation: Evaluation }>) {
  const formats = evaluation.formats.filter((format) => format.score !== 0);
  return (
    <Row wrap gap={6} align="center">
      <QualityPill quality={evaluation.quality} allowed={evaluation.qualityRank != null} />
      {formats.map((format) => (
        <Row
          key={format.id}
          radius="pill"
          bg={format.score > 0 ? 'tint/8' : 'danger/10'}
          px={8}
          py={2}
        >
          <Text variant="meta" color={format.score > 0 ? 'text' : 'dangerHover'} lines={1}>
            {format.name}
          </Text>
        </Row>
      ))}
    </Row>
  );
}

function Verdict({ file, goal }: Readonly<{ file: JudgedFile; goal: QualityGoal | null }>) {
  const t = useT();
  const shortfallText = useShortfallText();
  const narrow = useBreakpoint() === 'base';
  const verdict = verdictOf(file, goal);
  const reasons =
    verdict === 'below' && goal?.kind === 'target'
      ? shortfallsOf(goal, file.evaluation).map((reason) => shortfallText(reason, goal))
      : [];
  const lines = narrow ? reasons : [reasons.join(' · ')];
  return (
    <Row wrap gapX={10} gapY={4} align="center" minW={0}>
      <Badge tone={VERDICT_TONE[verdict]}>{t(`acq.verdict.${verdict}`)}</Badge>
      {reasons.length > 0
        ? lines.map((line) => (
            <Text key={line} variant="meta" color="textMuted">
              {line}
            </Text>
          ))
        : null}
    </Row>
  );
}

function verdictOf(file: JudgedFile, goal: QualityGoal | null): FileVerdict {
  if (goal?.kind === 'keep') return 'kept';
  return file.belowTarget ? 'below' : 'reached';
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
