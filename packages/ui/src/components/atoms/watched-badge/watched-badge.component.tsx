import { activeTheme, color, styles, useStyleScope } from '#ui/core';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';

import { useStyles } from '#ui/core/styles';
import { useDirection } from '#ui/lib/direction';
import { Polygon, Svg } from '#ui/lib/svg.component';
import { useTDefault } from '#ui/services/i18n';

// A right triangle's optical centre is a third along each leg, not half.
const CENTRE = 1 / 3;

type WatchedCorner = 'top-start' | 'top-end';

interface WatchedBadgeProps {
  /** Length of the fold's two legs in px. Defaults to 40. */
  size?: number;
  /** Which corner it folds into, by the writing direction. Defaults to the top
   *  start: the left in English, the right in Arabic. */
  corner?: WatchedCorner;
}

/**
 * The one mark that says a title has been watched: a folded corner, the shape
 * the media servers KROMA's viewers arrive from use for this. It changes the
 * tile's silhouette, so it reads before its colour does and survives artwork it
 * happens to match.
 *
 * It pins ITSELF flush into the corner: a fold that floats inside the tile reads
 * as a sticker. The surface only has to clip, which every art box already does,
 * and the fold takes the tile's own rounded corner from that.
 */
function WatchedBadge({ size = 40, corner = 'top-start' }: Readonly<WatchedBadgeProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const t = useTDefault();
  const end = corner === 'top-end';
  const right = end !== (useDirection() === 'rtl');
  const glyph = Math.round(size * 0.34);
  const inset = Math.round(size * CENTRE - glyph / 2);
  return (
    <Box
      absolute
      top={0}
      start={end ? undefined : 0}
      end={end ? 0 : undefined}
      z={1}
      w={size}
      h={size}
      style={s.mark}
      accessibilityRole="image"
      accessibilityLabel={t('content.watched')}
    >
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Polygon
          points={right ? '0,0 40,0 40,40' : '0,0 40,0 0,40'}
          fill={color('accent', activeTheme(scope.theme))}
        />
      </Svg>
      <Box absolute top={inset} start={end ? undefined : inset} end={end ? inset : undefined}>
        <Icon name="check" size={glyph} color="accentInk" thickness={3} />
      </Box>
    </Box>
  );
}

const sDefinition = styles({ mark: { pointerEvents: 'none' } });

export type { WatchedBadgeProps, WatchedCorner };
export { WatchedBadge };
