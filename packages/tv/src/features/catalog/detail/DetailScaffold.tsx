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
  Txt,
  tintGradient,
} from '@kroma/ui/kit';
import type { ReactNode } from 'react';

// Two layers rather than one comma-separated background-image: multi-value
// backgrounds are a CSS-only luxury React Native's gradient support lacks.
const VEIL_HORIZONTAL = `linear-gradient(90deg, ${colors.bg} 12%, transparent 68%)`;
const VEIL_VERTICAL = `linear-gradient(0deg, ${colors.bg} 4%, transparent 60%)`;

// clamp(46px, 7.6vh, 86px) resolves to 82px on the fixed 1080-tall stage.
const TITLE = { fontSize: 82, lineHeight: 78, fontWeight: '700' as const, letterSpacing: -1.64 };

/**
 * Shared chrome for the Film / Série detail screens: full-bleed backdrop, veil,
 * the overline + title + meta row + synopsis header, and the persistent top nav.
 *
 * The screen's `actions` are a prop rather than the first of its `children`
 * because the header and its buttons are ONE row: the eye reads them as one
 * block, and so does the page's scroller, which shows a row from its top. Were
 * the buttons a row of their own, taking the focus would align THEM near the top
 * of the screen and push the title and the synopsis off it - and coming back up
 * from the episodes would do exactly the same, so the header would never return.
 * Everything below the header renders as `children`, one row each.
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

      <FocusScroll style={DETAIL_SCROLL} contentStyle={DETAIL_CONTENT} offsetFromStart={120}>
        {/* The header and the actions, one row: the page shows it whole. */}
        <FocusSlot>
          <Txt variant="overlineTv" color="accent">
            {kind}
          </Txt>
          <Txt variant="hero" style={[TITLE, { marginTop: 14, marginBottom: 16 }]}>
            {title}
          </Txt>

          <Box row wrap align="center" gap={13} mb={18}>
            {rating ? (
              <>
                <Txt style={{ fontSize: 18, fontWeight: '700' }} color="accent">
                  {`${rating.toFixed(1)}★`}
                </Txt>
                <Txt style={{ fontSize: 18, fontWeight: '600' }} color="textDim">
                  ·
                </Txt>
              </>
            ) : null}
            <Txt style={{ fontSize: 18, fontWeight: '600' }} color="textMuted">
              {meta}
            </Txt>
            {badge ? <Badge tone={qualityTone(badge)}>{badge}</Badge> : null}
          </Box>

          {overview ? (
            <Txt
              lines={3}
              style={{ fontSize: 20, lineHeight: 30, maxWidth: 680, marginBottom: 26 }}
              color="rgba(244, 243, 240, 0.82)"
            >
              {overview}
            </Txt>
          ) : null}

          {actions}
        </FocusSlot>

        {children}
      </FocusScroll>
    </Box>
  );
}

/** The page scroller's own box: the navigator scrolls it to follow focus. */
const DETAIL_SCROLL = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;

/** The padding belongs to the CONTENT, not to the scroller's own box: on the
 * box it would pad the viewport and clip the last row instead of the list. */
const DETAIL_CONTENT = { paddingHorizontal: 64, paddingTop: 367, paddingBottom: 64 } as const;
