import { type StyleScope, sharedStyle, styles, useStyleScope, useTheme } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { typeSpec as textRoles, fontSizes as textSizes } from '#ui/core/tokens';
// <PosterCard>: the 2:3 portrait tile of the browse grids (Films, Series).
//
// The same anatomy as <MediaCard> at a different aspect and type scale. It fills
// its grid cell rather than declaring a width, so the grid owns the column maths.

import { ArtScrim } from '#ui/components/atoms/art-scrim';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { WatchedBadge } from '#ui/components/atoms/watched-badge';
import { FADE_UNIT, tintFill, tintGradient } from '#ui/components/molecules/media-card';
import { CardProgress } from '#ui/lib/card-progress';
import { WEB } from '#ui/lib/platform';

interface PosterCardProps {
  title: string;
  /** A word above the title naming what the tile is - `FILM`, `SERIES`. Cased by
   *  the style, so pass it in the reading case. Omit it and the title sits alone. */
  overline?: string;
  /** Portrait key art. Falls back to the `tint` gradient. */
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

  const { radius } = useTheme();
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
      <Box aspect={2 / 3} radius="xl" overflow="hidden" bg="surface1" dataSet={FADE_UNIT}>
        <Img
          src={art}
          background={WEB ? undefined : tintGradient(tint)}
          radius={WEB ? undefined : radius.xl}
          fill
          noCrossFade
        />
        <ArtScrim variant="deep" radius={WEB ? 0 : 'xl'} />
        {watched ? <WatchedBadge /> : null}
        <Box absolute left={14} right={14} bottom={12} gap={3}>
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
    </Focusable>
  );
}

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
