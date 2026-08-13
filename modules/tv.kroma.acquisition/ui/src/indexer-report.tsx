// What every indexer made of the last sweep. An error banner alone could not
// say whether the other trackers were asked, answered, or were never reached:
// one row per indexer, so "nothing found" and "the tracker is down" stop looking
// like the same result.

import { useT } from '@kroma/module-sdk';
import { Box, Row, Text } from '@kroma/ui/kit';

/** What the strip needs of an indexer's answer. Structural rather than the
 *  branded `IndexerReport`, because the free-text sweep is a module's own wire
 *  type carrying the same five fields. */
export interface IndexerAnswer {
  id: string;
  name: string;
  found: number;
  error: string | null;
  elapsedMs: number;
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
        {report.error ? t('requests.indexerDown') : String(report.found)}
      </Text>
      <Text variant="meta" color="text/30">
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
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
