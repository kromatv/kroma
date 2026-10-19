import type { ViewStyle } from 'react-native';
import { type StyleScope, sharedStyle, styles, useStyleScope, useTheme } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { fontSizes as textSizes } from '#ui/core/tokens';
// <MediaCard>: the 16:9 landscape rail tile of the 10-foot home. Focusable, so
// the same source is a D-pad stop on a TV and a click target in a browser.

import { ArtScrim } from '#ui/components/atoms/art-scrim';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { WatchedBadge } from '#ui/components/atoms/watched-badge';
import { CardProgress } from '#ui/lib/card-progress';
import { WEB } from '#ui/lib/platform';

/** The fill behind artwork, so a tile is never blank while the art loads. */

const frameOf = (width: number | string, scope: StyleScope) =>
  sharedStyle(`media-card:${width}`, { width, flexShrink: 0, radius: 'xl' }, scope);
function tintGradient(tint: readonly [string, string]): string {
  // `to bottom`, not a tilt: a tilted gradient's iso-lines run diagonally, so it
  // reads as a wedge across the card's width rather than as a fade.
  return `linear-gradient(to bottom, ${tint[0]} 0%, ${tint[1]} 72%)`;
}

/** A card frame's stand-in fill on the browser targets, where the art fades in
 *  over it as one layer; nothing on React Native, where the art carries it. */
function tintFill(tint: readonly [string, string], scope: StyleScope): ViewStyle | null {
  return WEB
    ? (sharedStyle(`card:tint:${tint[0]}`, { backgroundColor: tint[0] }, scope) as ViewStyle)
    : null;
}

/** Marks the box a card's art and caption fade in with. */
const FADE_UNIT = { kromaFadeUnit: '' } as const;

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
  /** OK held on a remote, or a finger held on the tile. */
  onLongPress?: () => void;
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
  onLongPress,
  onFocus,
  autoFocus,
}: Readonly<MediaCardProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const { radius } = useTheme();
  return (
    <Focusable
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      autoFocus={autoFocus}
      label={title}
      focusScale={1.06}
      style={[frameOf(width, scope), tintFill(tint, scope)]}
    >
      <Box
        w={width}
        aspect={16 / 9}
        radius="xl"
        overflow="hidden"
        bg="surface1"
        dataSet={FADE_UNIT}
      >
        <Img
          src={art}
          background={WEB ? undefined : tintGradient(tint)}
          radius={WEB ? undefined : radius.xl}
          position="50% 28%"
          fill
          noCrossFade
        />
        <ArtScrim radius={WEB ? 0 : 'xl'} />
        {watched ? <WatchedBadge /> : null}
        <Box absolute left={18} right={18} bottom={16} gap={5}>
          {overline ? <Text style={s.overline}>{overline}</Text> : null}
          <Text style={s.title} lines={2}>
            {title}
          </Text>
        </Box>
        <CardProgress value={progress} />
      </Box>
    </Focusable>
  );
}

const sDefinition = styles({
  overline: {
    font: 'ui',
    fontWeight: '700',
    fontSize: textSizes.caption,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'white/65',
  },
  title: {
    text: 'subheading',
    color: 'white',
  },
});

export type { MediaCardProps };
export { FADE_UNIT, MediaCard, tintFill, tintGradient };
