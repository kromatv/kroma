// <PosterCard>: the 2:3 portrait tile of the browse grids (Films, Series).
//
// The same anatomy as <MediaCard> at a different aspect and type scale. It fills
// its grid cell rather than declaring a width, so the grid owns the column maths.

import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Progress } from '#ui/components/atoms/progress';
import { Txt } from '#ui/components/atoms/text';
import { WatchedBadge } from '#ui/components/atoms/watched-badge';
import { tintGradient } from '#ui/components/molecules/media-card';
import { gradient } from '#ui/lib/css';
import { fonts, radius } from '#ui/lib/tokens';

/** Steeper than the rail tile's scrim: a poster is taller, so the fade has
 * further to travel before it reaches the title. */
const POSTER_SCRIM = [
  'linear-gradient(to top,',
  'rgba(0, 0, 0, 0.92) 0%,',
  // The title's own band. It has to be dark BEFORE the text starts, not at the
  // last pixel: a two-line title occupies roughly the bottom fifth of the card.
  'rgba(0, 0, 0, 0.78) 20%,',
  'rgba(0, 0, 0, 0.32) 42%,',
  'rgba(0, 0, 0, 0.08) 62%,',
  'rgba(0, 0, 0, 0) 78%)',
].join(' ');

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
        {/* Every layer rounds ITSELF, and the parent still clips. Belt and
            braces, because the braces demonstrably slip: Chrome fails to apply an
            `overflow: hidden` + `border-radius` clip to a COMPOSITED descendant,
            and the `<img decoding="async">` below is exactly that. The result was a
            card that drew as a hard-cornered rectangle - the scrim reaching square
            into all four corners over rounded artwork - on every tile EXCEPT the
            focused one, which escaped it only because its focus scale forces Chrome
            to rasterise the clip. Rounding each layer costs nothing and does not
            depend on the compositor agreeing with us. */}
        <Img src={art} background={tintGradient(tint)} radius={radius.lg} fill />
        <Box fill radius="lg" style={gradient(POSTER_SCRIM)} />
        {watched ? <WatchedBadge size={26} /> : null}
        <Box absolute left={14} right={14} bottom={12}>
          <Txt style={TITLE} lines={2}>
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

const TITLE = {
  fontFamily: fonts.display,
  fontWeight: '700' as const,
  fontSize: 18,
  lineHeight: 19,
  color: '#FFFFFF',
};

export type { PosterCardProps };
export { POSTER_SCRIM, PosterCard };
