// <WatchedBadge>: the one mark that says a title has been watched.

import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { color, styles } from '#ui/core';
import { Polygon, Svg } from '#ui/lib/svg';
import { useTDefault } from '#ui/services/i18n';

// A right triangle's optical centre is a third along each leg, not half.
const CENTRE = 1 / 3;

type WatchedCorner = 'top-left' | 'top-right';

interface WatchedBadgeProps {
  /** Length of the fold's two legs in px. Defaults to 40. */
  size?: number;
  /** Which corner it folds into. Defaults to the top left. */
  corner?: WatchedCorner;
}

/**
 * A folded corner, the shape the media servers KROMA's viewers arrive from use
 * for this. It changes the tile's silhouette, so it reads before its colour does
 * and survives artwork it happens to match.
 *
 * It pins ITSELF flush into the corner: a fold that floats inside the tile reads
 * as a sticker. The surface only has to clip, which every art box already does,
 * and the fold takes the tile's own rounded corner from that.
 */
function WatchedBadge({ size = 40, corner = 'top-left' }: Readonly<WatchedBadgeProps>) {
  const t = useTDefault();
  const right = corner === 'top-right';
  const glyph = Math.round(size * 0.34);
  const inset = Math.round(size * CENTRE - glyph / 2);
  return (
    <Box
      absolute
      top={0}
      left={right ? undefined : 0}
      right={right ? 0 : undefined}
      z={1}
      w={size}
      h={size}
      style={s.mark}
      accessibilityRole="image"
      accessibilityLabel={t('content.watched')}
    >
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Polygon points={right ? '0,0 40,0 40,40' : '0,0 40,0 0,40'} fill={color('accent')} />
      </Svg>
      <Box absolute top={inset} left={right ? undefined : inset} right={right ? inset : undefined}>
        <Icon name="check" size={glyph} color="accentInk" thickness={3} />
      </Box>
    </Box>
  );
}

const s = styles({ mark: { pointerEvents: 'none' } });

export type { WatchedBadgeProps, WatchedCorner };
export { WatchedBadge };
