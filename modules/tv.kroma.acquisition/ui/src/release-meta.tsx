import type { ScoredReleaseView } from '@kromatv/client/requests';
import { useFormat, useT } from '@kromatv/module-sdk';
import { Row, Text } from '@kromatv/ui/kit';
import { FlagBadges } from './judgement-pills';
import { useRefusalText } from './refusal-text';
import { targetLabel } from './release-sort';

export function ReleaseMeta({ release }: Readonly<{ release: ScoredReleaseView }>) {
  const t = useT();
  const fmt = useFormat();
  const refusal = useRefusalText()(release.refusal, release.rejected);
  const target = targetLabel(release);
  const where = [release.indexerName, release.publishedAt ? fmt.elapsed(release.publishedAt) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Row wrap gapX={10} gapY={4} align="center" minW={0}>
      {target ? (
        <Text variant="meta" color="textMuted">
          {target}
        </Text>
      ) : null}
      <Text variant="meta" color="textDim" lines={1}>
        {where}
      </Text>
      <FlagBadges flags={release.flags} />
      {refusal ? (
        <Text variant="meta" color="dangerHover" lines={1}>
          {t('acq.refusedBy', { reason: refusal })}
        </Text>
      ) : null}
    </Row>
  );
}
