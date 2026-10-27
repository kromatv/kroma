import { type StyleScope, color, sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { typeSpec as textRoles, fontSizes as textSizes } from '#ui/core/tokens';
// <PosterCard>: the 2:3 portrait tile of the browse grids (Films, Series).
//
// The same anatomy as <MediaCard> at a different aspect and type scale. It fills
// its grid cell rather than declaring a width, so the grid owns the column maths.

import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { WatchedBadge } from '#ui/components/atoms/watched-badge';
import { FADE_UNIT, tintFill } from '#ui/components/molecules/media-card';
import { CardProgress } from '#ui/lib/card-progress';
import { FocusTilt } from '#ui/lib/focus-tilt';
import { gradient } from '#ui/lib/css';

interface PosterCardProps {
  title: string;
  /** A word above the title naming what the tile is - `FILM`, `SERIES`. Cased by
   *  the style, so pass it in the reading case. Omit it and the title sits alone. */
  overline?: string;
  /** Portrait key art. Falls back to the `tint` fill. */
  art: string | null;
  tint: readonly [string, string];
  /** Resume / series-completion position, 0..1, or null for no bar. */
  progress?: number | null;
  watched?: boolean;
  /** An explicit tile width. Omit inside a <Grid>, whose cell already sets the
   *  column width; a VIRTUALISED grid has no cell to fill (its rows are laid out
   *  from the item size it was given), so there the tile states its own. */
  width?: number;
  onPress?: () => void;
  /** OK held on a remote, or a finger held on the tile. */
  onLongPress?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
}

const frameOf = (width: number | string, scope: StyleScope) =>
  sharedStyle(`poster-card:${width}`, { width, radius: 'xl' }, scope);
function PosterCard({
  title,
  overline,
  art,
  tint,
  progress = null,
  watched = false,
  width,
  onPress,
  onLongPress,
  onFocus,
  autoFocus,
}: Readonly<PosterCardProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);
  const ramp = useStyles(rampDefinition);

  return (
    <Focusable
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      autoFocus={autoFocus}
      label={title}
      focusScale={1.05}
      style={[frameOf(width ?? '100%', scope), tintFill(tint, scope)]}
    >
      {({ focused }) => (
        <FocusTilt active={focused}>
          <Box aspect={2 / 3} radius="xl" overflow="hidden" dataSet={FADE_UNIT}>
            <Img src={art} fill noCrossFade />
            {watched ? <WatchedBadge /> : null}
            <Box
              absolute
              left={0}
              right={0}
              bottom={0}
              px={14}
              pt={48}
              pb={12}
              gap={3}
              style={ramp.band}
            >
              {overline ? (
                <Text style={s.overline} lines={1}>
                  {overline}
                </Text>
              ) : null}
              <Text style={s.title} lines={2}>
                {title}
              </Text>
            </Box>
            <CardProgress value={progress} />
          </Box>
        </FocusTilt>
      )}
    </Focusable>
  );
}

const BAND = `linear-gradient(to bottom, ${color('black/0')}, ${color('black/70')} 40px, ${color('black/70')})`;

const rampDefinition = styles({ band: gradient(BAND) });

const sDefinition = styles({
  overline: {
    font: 'ui',
    fontWeight: '700',
    fontSize: textRoles.overline.size,
    lineHeight: 13,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'white/65',
  },
  title: {
    font: 'display',
    fontWeight: '700',
    fontSize: textSizes.largeLabel,
    lineHeight: 19,
    color: 'white',
  },
});

export type { PosterCardProps };
export { PosterCard };
