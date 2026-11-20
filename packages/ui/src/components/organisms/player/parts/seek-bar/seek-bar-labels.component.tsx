import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { scaler } from '#ui/components/organisms/player/lib/metrics';
import { resolveStyles, type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';

export interface SeekBarLabelsProps {
  elapsed: string;
  total: string;
  endsAt: string;
  chapterLabel?: string;
  scale?: number;
}

export function SeekBarLabels({
  elapsed,
  total,
  endsAt,
  chapterLabel,
  scale = 1,
}: Readonly<SeekBarLabelsProps>) {
  const scope = useStyleScope();
  const px = scaler(scale);
  const sized = scaled(scale, scope);

  return (
    <Box row align="baseline" between gap={px(12)} mb={px(13)}>
      <Text lines={1} style={sized.timeShrink}>
        {elapsed}
        {chapterLabel ? (
          <Text style={sized.timeMuted} color="text/50">{` · ${chapterLabel}`}</Text>
        ) : null}
      </Text>
      <Text lines={1} style={sized.time} color="text/50">
        {total}
        {endsAt ? <Text style={sized.timeMuted} color="text/38">{` · ${endsAt}`}</Text> : null}
      </Text>
    </Box>
  );
}

const TIME_SIZE = 18;

const sDefinition = styles({
  time: { font: 'ui', fontWeight: '600', color: 'text', fontVariant: ['tabular-nums'] },
  muted: { fontWeight: '500' },
  shrink: { shrink: 1 },
});

function scaled(scale: number, scope: StyleScope) {
  const px = scaler(scale);
  const base = resolveStyles(sDefinition, scope);
  const time = sharedStyle(`seek:time:${scale}`, { fontSize: px(TIME_SIZE) }, scope);
  return {
    time: [base.time, time],
    timeMuted: [base.time, time, base.muted],
    timeShrink: [base.time, time, base.shrink],
  };
}
