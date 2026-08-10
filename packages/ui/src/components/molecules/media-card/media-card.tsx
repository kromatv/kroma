// <MediaCard>: the 16:9 landscape rail tile of the 10-foot home. Focusable, so
// the same source is a D-pad stop on a TV and a click target in a browser.

import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Progress } from '#ui/components/atoms/progress';
import { Txt } from '#ui/components/atoms/text';
import { WatchedBadge } from '#ui/components/atoms/watched-badge';
import { styles, useTheme } from '#ui/core';
import { gradient } from '#ui/lib/css';

const CARD_SCRIM = 'linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 40%, rgba(0, 0, 0, 0.75) 100%)';

/** The fill behind artwork, so a tile is never blank while the art loads. */
function tintGradient(tint: readonly [string, string]): string {
  // `to bottom`, not a tilt: a tilted gradient's iso-lines run diagonally, so it
  // reads as a wedge across the card's width rather than as a fade.
  return `linear-gradient(to bottom, ${tint[0]} 0%, ${tint[1]} 72%)`;
}

interface MediaCardProps {
  title: string;
  overline?: string;
  art: string | null;
  tint: readonly [string, string];
  /** Resume position, 0..1, or null for no bar. */
  progress?: number | null;
  watched?: boolean;
  /** Defaults to filling the cell it is placed in, which is what a <Rail>'s
   *  pitch assumes: the rail fits its pitch to a whole number of columns (see
   *  `fitPitch`), so a tile pinned to a number of its own overflows the gap the
   *  cell was holding for it and the row reads as one unbroken strip. Pass a
   *  number only OUTSIDE a rail. */
  width?: number | '100%';
  onPress?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
}

function MediaCard({
  title,
  overline,
  art,
  tint,
  progress = null,
  watched = false,
  width = '100%',
  onPress,
  onFocus,
  autoFocus,
}: Readonly<MediaCardProps>) {
  const { radius } = useTheme();
  return (
    <Focusable
      onPress={onPress}
      onFocus={onFocus}
      autoFocus={autoFocus}
      label={title}
      focusScale={1.06}
      style={{ width, flexShrink: 0, borderRadius: radius.xl }}
    >
      <Box w={width} aspect={16 / 9} radius="xl" overflow="hidden" bg="surface1" shadow="card">
        {/* Every layer rounds itself as well as being clipped by the parent:
            Chrome fails to apply an `overflow: hidden` + `border-radius` clip to
            a composited descendant, which the `<img decoding="async">` is. */}
        <Img src={art} background={tintGradient(tint)} radius={radius.xl} position="50% 28%" fill />
        <Box fill radius="xl" style={gradient(CARD_SCRIM)} />
        {watched ? <WatchedBadge /> : null}
        <Box absolute left={18} right={18} bottom={16} gap={5}>
          {overline ? <Txt style={s.overline}>{overline}</Txt> : null}
          <Txt style={s.title} lines={2}>
            {title}
          </Txt>
        </Box>
        {progress == null ? null : (
          <Box absolute left={0} right={0} bottom={0}>
            <Progress value={progress} />
          </Box>
        )}
      </Box>
    </Focusable>
  );
}

const s = styles({
  overline: {
    font: 'ui',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'white/65',
  },
  title: {
    font: 'display',
    fontWeight: '700',
    fontSize: 24,
    lineHeight: 25,
    color: 'white',
  },
});

export type { MediaCardProps };
export { CARD_SCRIM, MediaCard, tintGradient };
