import type { FormatScore, ScoredReleaseView } from '@kromatv/client/requests';
import { TABULAR } from '@kromatv/module-sdk';
import { Row, Text } from '@kromatv/ui/kit';
import { scoredFirst } from './matched-formats';
import { targetLabel } from './release-sort';
import { useQualityLabel } from './use-quality-label';

export function ReleaseFacts({ release }: Readonly<{ release: ScoredReleaseView }>) {
  const label = useQualityLabel();
  const formats = scoredFirst(release.formats);
  const scored = formats.filter((format) => format.score !== 0);
  const plain = formats.filter((format) => format.score === 0).map((format) => format.name);
  const qualityRefused = release.refusal?.rule === 'quality';
  const target = targetLabel(release);
  return (
    <Row wrap gapX={8} gapY={6} align="center" minW={0}>
      {target ? (
        <Row radius="sm" bg="tint/8" px={6} py={1} mr={2}>
          <Text variant="meta" font="mono" color="text">
            {target}
          </Text>
        </Row>
      ) : null}
      {release.quality ? (
        <Text variant="label" color={qualityRefused ? 'dangerHover' : 'text'} mr={4}>
          {label(release.quality)}
        </Text>
      ) : null}
      {scored.map((format) => (
        <FormatChip key={format.name} format={format} />
      ))}
      {plain.length > 0 ? (
        <Text variant="meta" color="textDim" lines={1}>
          {plain.join(' · ')}
        </Text>
      ) : null}
    </Row>
  );
}

function FormatChip({ format }: Readonly<{ format: FormatScore }>) {
  const gain = format.score > 0;
  return (
    <Row radius="pill" px={8} py={2} gap={5} bg={gain ? 'success/12' : 'danger/12'}>
      <Text variant="meta" color="text">
        {format.name}
      </Text>
      <Text variant="meta" color={gain ? 'success' : 'dangerHover'} style={TABULAR}>
        {gain ? `+${format.score}` : String(format.score)}
      </Text>
    </Row>
  );
}
