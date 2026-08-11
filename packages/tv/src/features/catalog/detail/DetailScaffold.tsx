import { posterColors } from '@kroma/core';
import {
  Badge,
  Box,
  colors,
  FocusScroll,
  FocusSlot,
  gradient,
  Img,
  qualityTone,
  styles,
  Text,
  tintGradient,
} from '@kroma/ui/kit';
import type { ReactNode } from 'react';

// Two layers rather than one comma-separated background-image: multi-value
// backgrounds are a CSS-only luxury React Native's gradient support lacks.
const VEIL_HORIZONTAL = `linear-gradient(90deg, ${colors.bg} 12%, transparent 68%)`;
const VEIL_VERTICAL = `linear-gradient(0deg, ${colors.bg} 4%, transparent 60%)`;

/**
 * Shared chrome for the Film / Série detail screens: full-bleed backdrop,
 * veil, the overline + title + meta row + synopsis header, and the
 * persistent top nav.
 *
 * `actions` is a prop rather than the first of `children` because the header
 * and its buttons must scroll as one row — a row of their own would let the
 * scroller align on the buttons and push the title off screen.
 */
export function TvDetailScaffold({
  id,
  kind,
  title,
  backdrop,
  rating,
  meta,
  badge,
  overview,
  actions,
  children,
}: Readonly<{
  id: string;
  kind: string;
  title: string;
  backdrop: string | null;
  rating: number | null | undefined;
  meta: string;
  badge: string | null;
  overview: string | null | undefined;
  actions: ReactNode;
  children: ReactNode;
}>) {
  return (
    <Box fill bg="bg" overflow="hidden">
      <Img src={backdrop} background={tintGradient(posterColors(id))} position="50% 18%" fill />
      <Box fill pointerEvents="none" style={gradient(VEIL_HORIZONTAL)} />
      <Box fill pointerEvents="none" style={gradient(VEIL_VERTICAL)} />

      <FocusScroll style={s.scroll} contentStyle={s.content} offsetFromStart={120}>
        <FocusSlot>
          <Text variant="overlineTv" color="accentText">
            {kind}
          </Text>
          <Text variant="hero" style={[s.title, { marginTop: 14, marginBottom: 16 }]}>
            {title}
          </Text>

          <Box row wrap align="center" gap={13} mb={18}>
            {rating ? (
              <>
                <Text variant="strongTv" color="accentText">
                  {`${rating.toFixed(1)}★`}
                </Text>
                <Text variant="labelTv" color="textDim">
                  ·
                </Text>
              </>
            ) : null}
            <Text variant="labelTv" color="textMuted">
              {meta}
            </Text>
            {badge ? <Badge tone={qualityTone(badge)}>{badge}</Badge> : null}
          </Box>

          {overview ? (
            <Text lines={3} variant="bodyTv" maxW={680} mb={26} color="text/82">
              {overview}
            </Text>
          ) : null}

          {actions}
        </FocusSlot>

        {children}
      </FocusScroll>
    </Box>
  );
}

const s = styles({
  // clamp(46px, 7.6vh, 86px) resolves to 82px on the fixed 1080-tall stage.
  title: { fontSize: 82, lineHeight: 78, fontWeight: '700', letterSpacing: -1.64 },
  scroll: { fill: true },
  // Padding belongs on the content, not the scroller box: on the box it would
  // pad the viewport and clip the last row instead of the list.
  content: { px: 64, pt: 367, pb: 64 },
});
