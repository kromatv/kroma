import type { Arrival } from '@kromatv/core';
import { Box } from '#ui/components/atoms/box';
import { ProgressRing } from '#ui/components/atoms/progress-ring';
import { Text } from '#ui/components/atoms/text';
import { sharedStyle, styles, useTheme } from '#ui/core';

const RING = 20;
const THICKNESS = 3;
const TEXT_SIZE = 15;
const WIDEST_SHARE_PX = 44;
const TRACK = 'rgba(255, 255, 255, 0.16)';

interface ArrivalBadgeProps {
  arrival: Arrival;
  /** The chrome's scale, as `<Player.Root>` measures it. 1 on a television. */
  scale?: number;
}

function ArrivalBadge({ arrival, scale = 1 }: Readonly<ArrivalBadgeProps>) {
  const theme = useTheme();
  const px = (size: number) => Math.round(size * scale);
  return (
    <Box
      row
      align="center"
      gap={px(8)}
      accessibilityLabel={`${arrival.share.label} ${arrival.share.text}`}
      style={s.inert}
    >
      <ProgressRing
        value={arrival.progress}
        size={px(RING)}
        thickness={px(THICKNESS)}
        track={TRACK}
        fill={theme.colors.accent}
      />
      <Text lines={1} style={[s.share, shareSize(px(TEXT_SIZE), px(WIDEST_SHARE_PX))]}>
        {arrival.share.text}
      </Text>
    </Box>
  );
}

const shareSize = (fontSize: number, minWidth: number) =>
  sharedStyle(`arrival-badge:${fontSize}`, { fontSize, minWidth });

const s = styles({
  inert: { pointerEvents: 'none' },
  share: {
    font: 'ui',
    fontWeight: '700',
    color: 'white',
    fontVariant: ['tabular-nums'],
  },
});

export type { ArrivalBadgeProps };
export { ArrivalBadge };
