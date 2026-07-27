// <MediaCard>: the 16:9 landscape rail tile of the 10-foot home.
//
// Key art over a deterministic genre gradient, a legibility scrim, the optional
// watched check and resume bar, and the title block. Focusable, so it is a D-pad
// stop on a TV and a click target in a browser from the same source.

import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Progress } from '#ui/components/atoms/progress';
import { Txt } from '#ui/components/atoms/text';
import { WatchedBadge } from '#ui/components/atoms/watched-badge';
import { gradient } from '#ui/lib/css';
import { fonts, radius } from '#ui/lib/tokens';

/** Bottom-weighted scrim: the art stays visible while the title stays legible. */
const CARD_SCRIM = 'linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 40%, rgba(0, 0, 0, 0.75) 100%)';

/** The instant-visible fill behind artwork: a deterministic per-title gradient,
 * so a tile is never blank while the art loads and never blank if it fails. */
function tintGradient(tint: readonly [string, string]): string {
  // `to bottom`, not a tilt. A tilted gradient's iso-lines run diagonally, so its
  // progress differs across the card's WIDTH - on a 188x282 tile a 10-degree tilt
  // is a 10.5% difference between the two bottom corners, which reads as a wedge
  // that is not flush to the left and right edges rather than as a fade.
  return `linear-gradient(to bottom, ${tint[0]} 0%, ${tint[1]} 72%)`;
}

interface MediaCardProps {
  title: string;
  /** Overline above the title (the genre, or an episode tag). */
  overline?: string;
  /** Landscape key art. Falls back to the `tint` gradient. */
  art: string | null;
  /** The two stops of the deterministic per-title gradient. */
  tint: readonly [string, string];
  /** Resume position, 0..1, or null for no bar. */
  progress?: number | null;
  watched?: boolean;
  width?: number;
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
  width = 328,
  onPress,
  onFocus,
  autoFocus,
}: Readonly<MediaCardProps>) {
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
        {/* Every layer rounds ITSELF, and the parent still clips. Belt and
            braces, because the braces demonstrably slip: Chrome fails to apply an
            `overflow: hidden` + `border-radius` clip to a COMPOSITED descendant,
            and the `<img decoding="async">` below is exactly that. The result was a
            card that drew as a hard-cornered rectangle - the scrim reaching square
            into all four corners over rounded artwork - on every tile EXCEPT the
            focused one, which escaped it only because its focus scale forces Chrome
            to rasterise the clip. Rounding each layer costs nothing and does not
            depend on the compositor agreeing with us. */}
        <Img src={art} background={tintGradient(tint)} radius={radius.xl} position="50% 28%" fill />
        <Box fill radius="xl" style={gradient(CARD_SCRIM)} />
        {watched ? <WatchedBadge /> : null}
        <Box absolute left={18} right={18} bottom={16} gap={5}>
          {overline ? <Txt style={OVERLINE}>{overline}</Txt> : null}
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

const OVERLINE = {
  fontFamily: fonts.ui,
  fontWeight: '700' as const,
  fontSize: 12,
  lineHeight: 14,
  letterSpacing: 1.2,
  textTransform: 'uppercase' as const,
  color: 'rgba(255, 255, 255, 0.65)',
};

const TITLE = {
  fontFamily: fonts.display,
  fontWeight: '700' as const,
  fontSize: 24,
  lineHeight: 25,
  color: '#FFFFFF',
};

export type { MediaCardProps };
export { CARD_SCRIM, MediaCard, tintGradient };
