import { useT } from '@kromatv/module-sdk';
import { Box, Row, Text } from '@kromatv/ui/kit';

/** Structural rather than the branded `IndexerReport`, because the free-text
 *  sweep is a module's own wire type carrying the same five fields. */
export interface IndexerAnswer {
  id: string;
  name: string;
  found: number;
  error: string | null;
  elapsedMs: number;
}

export function nothingAnswered(indexers: readonly IndexerAnswer[]): boolean {
  return indexers.length > 0 && indexers.every((i) => Boolean(i.error));
}

export function IndexerReportStrip({ indexers = [] }: Readonly<{ indexers?: IndexerAnswer[] }>) {
  const t = useT();
  if (indexers.length === 0) return null;
  const failed = indexers.filter((i) => i.error).length;
  return (
    <Box gap={8}>
      <Row wrap gap={8}>
        {indexers.map((i) => (
          <IndexerPill key={i.id} report={i} />
        ))}
      </Row>
      {failed > 0 ? (
        <Text variant="meta" color="textDim">
          {t('requests.indexersFailed', { count: failed, total: indexers.length })}
        </Text>
      ) : null}
    </Box>
  );
}

function IndexerPill({ report }: Readonly<{ report: IndexerAnswer }>) {
  const t = useT();
  const tone = pillTone(report);
  return (
    <Row align="center" gap={7} radius="pill" px={10} py={4} bg={`${tone}/14`}>
      <Box w={6} h={6} shrink={0} radius="circle" bg={tone} />
      <Text variant="meta" color="textDim" lines={1}>
        {report.name}
      </Text>
      <Text variant="meta" color={tone}>
        {report.error ? t('requests.indexerDown') : t('acq.indexerFound', { count: report.found })}
      </Text>
      <Text variant="meta" color="textDim">
        {formatElapsed(report.elapsedMs)}
      </Text>
    </Row>
  );
}

function pillTone(report: IndexerAnswer): 'danger' | 'success' | 'textDim' {
  if (report.error) return 'danger';
  return report.found > 0 ? 'success' : 'textDim';
}

function formatElapsed(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}
