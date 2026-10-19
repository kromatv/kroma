import { useStyles } from '#ui/core/styles';
import { fontSizes as textSizes } from '#ui/core/tokens';
// <SplashBackdrop>: the sign-in screens' ambient artwork, one implementation
// for web, phone and TV: one cover at a time, dissolving on a slow drift under
// a grade dark enough to hold a form, with the KROMA wheel drawn as a 3px rule
// along the bottom edge. Purely decorative: it takes no input and hides itself
// from accessibility.
//
// Everything above the artwork is a gradient, which both platforms paint (see
// lib/css). The one seam - the photographic grade, and how the drift is driven -
// is not spelt here at all: `lib/splash-motion` answers both with one API, and
// its web half compiles the drift to @keyframes so the compositor owns it.

import { useEffect, useState } from 'react';
import { Animated, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Ground } from '#ui/components/atoms/ground';
import { IMG_FADE_MS, Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { styles, WHEEL_COLORS } from '#ui/core';
import { gradient, promote } from '#ui/lib/css';
import { prefetchImage } from '#ui/lib/prefetch-image';
import { safeImageUrl } from '#ui/lib/safe-image-url';
import { GRADE, useDrift } from '#ui/lib/splash-motion';

// Ambience, not a carousel: each cover lingers, and the handover is a long
// dissolve rather than a cut.
const HOLD_MS = 18000;
const FADE_MS = 2800;

// The grade that keeps a centred form readable over ANY artwork, in two parts:
// a vertical veil that seats the frame top and bottom, and a radial one that
// sinks the middle, where the form is. Two layers rather than one
// comma-separated background, which React Native's gradients cannot express;
// each is promoted so a full-screen gradient is rasterised once.
const layersDefinition = styles({
  veil: {
    ...gradient(
      'linear-gradient(180deg, rgba(8, 8, 10, 0.86) 0%, rgba(8, 8, 10, 0.5) 20%, rgba(8, 8, 10, 0.3) 38%, rgba(8, 8, 10, 0.72) 62%, rgba(8, 8, 10, 0.97) 88%)',
    ),
    ...promote(),
  },
  vignette: {
    ...gradient(
      'radial-gradient(58% 46% at 50% 50%, rgba(8, 8, 10, 0.72) 0%, rgba(8, 8, 10, 0.34) 58%, rgba(8, 8, 10, 0) 100%)',
    ),
    ...promote(),
  },
  foot: gradient(
    'linear-gradient(0deg, rgba(244, 180, 66, 0.07) 0%, rgba(79, 157, 224, 0.05) 46%, rgba(79, 157, 224, 0) 100%)',
  ),
});
// The wheel's warm and cool ends breathed back into the foot of the frame, so
// the rule below reads as where a gradient lands rather than as a sticker.
const FOOT_H = 190;
const RULE_H = 3;

// How far the artwork travels under the frame, as a fraction of the viewport,
// and the constant overscan that keeps an edge out of the picture while it
// does. The overscan is what bounds the pan: at scale S the frame hides
// (S - 1) / 2 of the width on each side, so raising the travel means raising
// the overscan with it.
const PAN_X = 0.06;
const PAN_Y = 0.04;
const ZOOM = 1.14;

const DRIFT_PX_PER_S = 6;

interface SplashCover {
  /** Full artwork URL, already resolved against the server. */
  url: string;
  /** Corner caption, e.g. "Alien: Earth · 2025". */
  caption?: string;
  /** Small overline before the caption, e.g. the localized "Film". */
  eyebrow?: string;
}

interface SplashBackdropProps {
  covers: readonly SplashCover[];
  /** How long each cover holds before the next dissolve. */
  holdMs?: number;
  style?: StyleProp<ViewStyle>;
}

/** The share of the full pan a cover walks in `ms` at `DRIFT_PX_PER_S`. */
function travelShare(width: number, height: number, ms: number): number {
  const span = Math.hypot(width * PAN_X * 2, height * PAN_Y * 2);
  if (!span) return 0;
  return Math.min(1, (DRIFT_PX_PER_S * ms) / 1000 / span);
}

interface CoverLayerProps {
  cover: SplashCover;
  box: { width: number; height: number };
  ms: number;
  fadeMs: number;
}

function CoverLayer({ cover, box, ms, fadeMs }: Readonly<CoverLayerProps>) {
  const s = useStyles(sDefinition);
  const share = travelShare(box.width, box.height, ms);
  const drift = useDrift({
    x: PAN_X * share,
    y: PAN_Y * share,
    zoom: ZOOM,
    ms,
    width: box.width,
    height: box.height,
  });
  return (
    <Animated.View style={[s.art, drift]}>
      <Img src={cover.url} fill duration={fadeMs} position="50% 40%" style={GRADE} />
    </Animated.View>
  );
}

/** The universal sign-in splash: hosts fetch `/api/splash`, map it to covers
 * and drop this behind their gate. It owns the rotation, the pre-decode of the
 * next cover, the grade that keeps a form readable, the wheel rule and the
 * caption; the host owns everything interactive above it. */
function SplashBackdrop({ covers, holdMs = HOLD_MS, style }: Readonly<SplashBackdropProps>) {
  const layers = useStyles(layersDefinition);
  const s = useStyles(sDefinition);

  const [slide, setSlide] = useState(0);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (covers.length < 2) return;
    const timer = setInterval(() => {
      setSlide((n) => n + 1);
      setFading(true);
    }, holdMs);
    return () => clearInterval(timer);
  }, [covers.length, holdMs]);
  useEffect(() => {
    if (!fading) return;
    const timer = setTimeout(() => setFading(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [fading, slide]);

  // Warm the next cover through the whole hold, so a dissolve never starts
  // against a half-loaded image.
  useEffect(() => {
    if (covers.length < 2) return;
    const next = safeImageUrl(covers[(slide + 1) % covers.length]?.url ?? null);
    if (!next) return;
    prefetchImage(next);
  }, [slide, covers]);

  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };
  const ms = holdMs + FADE_MS;
  const count = Math.max(covers.length, 1);
  const cover = covers[slide % count];
  const previous = fading ? covers[(slide - 1) % count] : undefined;
  if (!cover) return null;

  return (
    <Ground tone="dark" style={s.ground}>
      <Box
        fill
        bg="bg"
        overflow="hidden"
        pointerEvents="none"
        aria-hidden
        onLayout={onLayout}
        style={style}
      >
        {previous ? (
          <CoverLayer key={slide - 1} cover={previous} box={box} ms={ms} fadeMs={FADE_MS} />
        ) : null}
        <CoverLayer
          key={slide}
          cover={cover}
          box={box}
          ms={ms}
          fadeMs={slide === 0 ? IMG_FADE_MS : FADE_MS}
        />
        <Box fill style={layers.veil} />
        <Box fill style={layers.vignette} />
        <Box absolute left={0} right={0} bottom={0} h={FOOT_H} style={layers.foot} />
        <Box absolute left={0} right={0} bottom={0} h={RULE_H} row>
          {WHEEL_COLORS.map((segment) => (
            <Box key={segment} flex bg={segment} />
          ))}
        </Box>
        {cover.caption ? (
          // Bounded on BOTH sides and clipped to one line: a long title on a
          // portrait phone otherwise runs off the left edge.
          <Box
            absolute
            left={20}
            right={20}
            bottom={20}
            row
            align="center"
            justify="flex-end"
            gap={13}
          >
            {cover.eyebrow ? (
              <>
                <Text variant="overline" color="white/50" style={s.eyebrow}>
                  {cover.eyebrow}
                </Text>
                <Box w={16} h={1} bg="white/30" />
              </>
            ) : null}
            <Text color="white/90" lines={1} style={s.caption}>
              {cover.caption}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Ground>
  );
}

const sDefinition = styles({
  ground: { fill: true, pointerEvents: 'none' },
  art: { absolute: true, top: 0, right: 0, bottom: 0, left: 0 },
  eyebrow: { fontSize: textSizes.micro, letterSpacing: 2.6, shrink: 0 },
  caption: { fontSize: textSizes.compactLabel, fontWeight: '500', shrink: 1 },
});

export type { SplashBackdropProps, SplashCover };
export { SplashBackdrop };
