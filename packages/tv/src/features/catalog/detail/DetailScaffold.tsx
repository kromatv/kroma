import { posterColors } from '@kromatv/core';
import {
  Badge,
  Box,
  colors,
  FocusScroll,
  FocusSlot,
  Img,
  qualityTone,
  styles,
  Text,
  typeSpec as textRoles,
  tintGradient,
  TopFade,
  useStyles,
  Veil,
} from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

const VEIL_HORIZONTAL = `linear-gradient(90deg, ${colors.bg} 12%, transparent 68%)`;
const VEIL_VERTICAL = `linear-gradient(0deg, ${colors.bg} 4%, transparent 60%)`;
const FADE_FROM = 104;
const VEIL = `${VEIL_VERTICAL}, ${VEIL_HORIZONTAL}`;

/**
 * Shared chrome for the Film / Série detail screens: full-bleed backdrop,
 * veil, the overline + title + meta row + synopsis header, and the
 * persistent top nav.
 *
 * `actions` is a prop rather than the first of `children` because the header
 * and its buttons must scroll as one row: a row of their own would let the
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
  const s = useStyles(sDefinition);
  const backdropLayers = (
    <>
      <Img
        src={backdrop}
        background={tintGradient(posterColors(id))}
        position="50% 18%"
        fill
        opaque
      />
      <Veil ramp={VEIL} />
    </>
  );

  return (
    <Box fill overflow="hidden">
      <Img
        src={backdrop}
        background={tintGradient(posterColors(id))}
        position="50% 18%"
        fill
        layered
        opaque
      />
      <Veil ramp={VEIL} />

      <TopFade style={s.scroll} inset={FADE_FROM} backdrop={backdropLayers}>
        <FocusScroll style={s.scroll} contentStyle={s.content} offsetFromStart={120}>
          <FocusSlot>
            <Text variant="overlineTv" color="accentText">
              {kind}
            </Text>
            <Text variant="hero" style={[s.title, s.titleGap]}>
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
      </TopFade>
    </Box>
  );
}

const sDefinition = styles({
  titleGap: { mt: 14, mb: 16 },
  // clamp(46px, 7.6vh, 86px) resolves to 82px on the fixed 1080-tall stage.
  title: {
    fontSize: textRoles.heroTv.size,
    lineHeight: 78,
    fontWeight: '700',
    letterSpacing: -1.64,
  },
  scroll: { fill: true },
  // Padding belongs on the content, not the scroller box: on the box it would
  // pad the viewport and clip the last row instead of the list.
  content: { px: 64, pt: 367, pb: 64 },
});
