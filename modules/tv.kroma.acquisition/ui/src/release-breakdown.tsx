import type { ScoredReleaseView } from '@kromatv/client/requests';
import { TABULAR, useFormat, useT } from '@kromatv/module-sdk';
import { Box, Divider, Icon, Row, Text } from '@kromatv/ui/kit';
import { useRefusalText } from './refusal-text';
import { useScoreLineText } from './score-line-text';

const COLUMN_MIN = 260;
const SCORE_MAX = 400;

export function ScoreBreakdown({ release }: Readonly<{ release: ScoredReleaseView }>) {
  const t = useT();
  const fmt = useFormat();
  const lineText = useScoreLineText();
  const refusal = useRefusalText()(release.refusal, release.rejected);
  const kind = (line: ScoredReleaseView['breakdown'][number]) => line.code || line.rule;
  const scored = release.breakdown
    .filter((line) => kind(line) === 'format' && line.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const ranking = release.breakdown.filter((line) => kind(line) !== 'format');
  return (
    <Box px={18} py={16} bg="surface1">
      <Row wrap gapX={48} gapY={20} align="flex-start">
        <Box flex minW={COLUMN_MIN} maxW={SCORE_MAX} gap={6}>
          <Text variant="overline" color="textMuted">
            {t('acq.breakdownScore')}
          </Text>
          {refusal ? (
            <Text variant="meta" color="dangerHover">
              {t('acq.refusedBy', { reason: refusal })}
            </Text>
          ) : null}
          {scored.map((line) => (
            <Row key={`${line.rule}-${line.note}`} between gap={12}>
              <Text variant="meta" color="textDim" lines={1} minW={0}>
                {lineText(line)}
              </Text>
              <Text
                variant="meta"
                color={line.delta > 0 ? 'success' : 'dangerHover'}
                shrink={0}
                style={TABULAR}
              >
                {line.delta > 0 ? `+${line.delta}` : line.delta}
              </Text>
            </Row>
          ))}
          {scored.length === 0 && !refusal ? (
            <Text variant="meta" color="textDim">
              {t('acq.noScoredFormat')}
            </Text>
          ) : null}
          {release.score == null ? null : (
            <>
              <Divider color="tint/5" spacing={4} />
              <Row between gap={12}>
                <Text variant="meta" color="text">
                  {t('acq.scoreTotal')}
                </Text>
                <Text variant="meta" color="text" style={TABULAR}>
                  {release.score > 0 ? `+${release.score}` : release.score}
                </Text>
              </Row>
            </>
          )}
        </Box>
        <Box flex minW={COLUMN_MIN} gap={6}>
          <Text variant="overline" color="textMuted">
            {t('acq.breakdownDetails')}
          </Text>
          {ranking.map((line) => (
            <Text key={`${line.rule}-${line.note}`} variant="meta" color="textDim">
              {lineText(line)}
            </Text>
          ))}
          {release.publishedAt ? (
            <Text variant="meta" color="textDim">
              {t('acq.publishedOn', { date: fmt.stamp(release.publishedAt) ?? '' })}
            </Text>
          ) : null}
          {release.leechers == null ? null : (
            <Text variant="meta" color="textDim">
              {t('acq.peers', { seeders: release.seeders ?? 0, leechers: release.leechers })}
            </Text>
          )}
          {release.detailsUrl ? <TrackerLink href={release.detailsUrl} /> : null}
        </Box>
      </Row>
    </Box>
  );
}

function TrackerLink({ href }: Readonly<{ href: string }>) {
  const t = useT();
  return (
    <a href={href} target="_blank" rel="noreferrer">
      <Row gap={5} align="center" mt={4}>
        <Text variant="meta" color="accentText">
          {t('downloads.viewOnTracker')}
        </Text>
        <Icon name="external-link" size={12} thickness={2} color="accentText" />
      </Row>
    </a>
  );
}
