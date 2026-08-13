// <PosterCard>: the 2:3 portrait tile of the browse grids (Films, Series).
//
// The same anatomy as <MediaCard> at a different aspect and type scale. It fills
// its grid cell rather than declaring a width, so the grid owns the column maths.

import { ArtScrim } from '#ui/components/atoms/art-scrim';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Progress } from '#ui/components/atoms/progress';
import { Text } from '#ui/components/atoms/text';
import { WatchedBadge } from '#ui/components/atoms/watched-badge';
import { tintGradient } from '#ui/components/molecules/media-card';
import { styles, useTheme } from '#ui/core';

interface PosterCardProps {
  title: string;
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
  onFocus?: () => void;
  autoFocus?: boolean;
}

function PosterCard({
  title,
  art,
  tint,
  progress = null,
  watched = false,
  width,
  onPress,
  onFocus,
  autoFocus,
}: Readonly<PosterCardProps>) {
  const { radius } = useTheme();
  return (
    <Focusable
      onPress={onPress}
      onFocus={onFocus}
      autoFocus={autoFocus}
      label={title}
      focusScale={1.05}
      style={{ width: width ?? '100%', borderRadius: radius.lg }}
    >
      <Box aspect={2 / 3} radius="lg" overflow="hidden" bg="surface1" shadow="card">
        {/* Every layer rounds itself as well as the parent clipping: Chrome
            doesn't reliably apply an `overflow: hidden` + `border-radius` clip
            to a composited descendant like the `<img>` below. */}
        <Img src={art} background={tintGradient(tint)} radius={radius.lg} fill />
        <ArtScrim variant="deep" radius="lg" />
        {watched ? <WatchedBadge size={26} /> : null}
        <Box absolute left={14} right={14} bottom={12}>
          <Text style={s.title} lines={2}>
            {title}
          </Text>
        </Box>
        {progress == null ? null : (
          <Box absolute left={0} right={0} bottom={0}>
            <Progress value={progress} rounded={false} />
          </Box>
        )}
      </Box>
    </Focusable>
  );
}

const s = styles({
  title: {
    font: 'display',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 19,
    color: 'white',
  },
});

export type { PosterCardProps };
export { PosterCard };
