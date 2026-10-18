import { TABULAR, useT } from '@kromatv/module-sdk';
import { Box, Row, Skeleton, Surface, Text } from '@kromatv/ui/kit';
import { QualityPill, ScorePill } from './judgement-pills';
import type { QualityProfile } from './rules-schemas';
import { useRankingPreview } from './use-ranking-preview';

export function RankingPreview({ profile }: Readonly<{ profile: QualityProfile }>) {
  const t = useT();
  const preview = useRankingPreview(profile);
  if (preview.failed) return null;
  return (
    <Surface radius="lg" pad="sm" tone="raised">
      <Box gap={8}>
        <Box>
          <Text variant="label">{t('acq.rankingPreview')}</Text>
          <Text variant="meta" color="textDim">
            {t('acq.rankingPreviewHint')}
          </Text>
        </Box>
        {preview.busy ? <Skeleton h={88} radius="md" /> : null}
        {preview.rows.map((row, at) => (
          <Row key={row.name} gap={10} align="center">
            <Text variant="meta" color="textDim" style={TABULAR} w={20} shrink={0}>
              {row.rank === null ? '-' : at + 1}
            </Text>
            <Text
              variant="meta"
              color={row.rank === null ? 'textDim' : 'text'}
              lines={1}
              flex
              minW={0}
            >
              {row.name}
            </Text>
            <QualityPill quality={row.quality} allowed={row.rank !== null} />
            <ScorePill score={row.score} />
          </Row>
        ))}
      </Box>
    </Surface>
  );
}
