import { type ColorToken, styles, useStyles } from '@kromatv/ui/kit';
import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Progress } from '@kromatv/ui/kit/atoms/progress';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { completion, grouped, type ProgressTone, progressTone } from '#site/lib/completion';
import type { Progress as Done, Stage } from '#site/lib/views';

const COLOR: Record<ProgressTone, ColorToken> = {
  complete: 'success',
  partial: 'accent',
  draft: 'info',
};

const sDefinition = styles({ figures: { fontVariant: ['tabular-nums'] } });

/** How far a language or a section has come: one bar coloured by completeness, the percentage, and the count behind it. */
export function ProgressMeter({
  progress,
  stage,
  label,
}: Readonly<{ progress: Done; stage?: Stage; label: string }>) {
  const s = useStyles(sDefinition);
  const { ratio, percent } = completion(progress);
  const tone = progressTone(progress, stage);
  return (
    <Column gap={6} w="100%">
      <Progress value={ratio} thickness={6} color={COLOR[tone]} label={label} />
      <Row gap={8} between>
        <Text variant="meta" color={tone === 'complete' ? 'success' : 'text'} style={s.figures}>
          {`${percent}%`}
        </Text>
        <Text variant="meta" color="textDim" style={s.figures}>
          {`${grouped(progress.done)} / ${grouped(progress.total)}`}
        </Text>
      </Row>
    </Column>
  );
}
