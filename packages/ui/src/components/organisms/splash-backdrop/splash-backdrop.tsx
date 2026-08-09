// <SplashBackdrop>: the sign-in screens' ambient artwork, one implementation
// for web, phone and TV: one cover at a time, dissolving on a slow drift under
// a grade dark enough to hold a form, with the KROMA wheel drawn as a 3px rule
// along the bottom edge. Purely decorative: it takes no input and hides itself
// from accessibility.
//
// Everything above the artwork is a gradient, which both platforms paint (see
// lib/css). The one seam is the photographic grade: a CSS filter the web tier
// gets and native does without.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Platform,
  Image as RNImage,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { IMG_FADE_MS, Img } from '#ui/components/atoms/img';
import { Txt } from '#ui/components/atoms/text';
import { styles, WHEEL_COLORS } from '#ui/core';
import { gradient } from '#ui/lib/css';

const WEB = Platform.OS === 'web';

// Ambience, not a carousel: each cover lingers, and the handover is a long
// dissolve rather than a cut.
const HOLD_MS = 18000;
const FADE_MS = 2800;

// The grade that keeps a centred form readable over ANY artwork, in two parts:
// a vertical veil that seats the frame top and bottom, and a radial one that
// sinks the middle, where the form is.
const VEIL = gradient(
  'linear-gradient(180deg, rgba(8, 8, 10, 0.86) 0%, rgba(8, 8, 10, 0.5) 20%, rgba(8, 8, 10, 0.3) 38%, rgba(8, 8, 10, 0.72) 62%, rgba(8, 8, 10, 0.97) 88%)',
);
const VIGNETTE = gradient(
  'radial-gradient(58% 46% at 50% 50%, rgba(8, 8, 10, 0.72) 0%, rgba(8, 8, 10, 0.34) 58%, rgba(8, 8, 10, 0) 100%)',
);
// The wheel's warm and cool ends breathed back into the foot of the frame, so
// the rule below reads as where a gradient lands rather than as a sticker.
const FOOT = gradient(
  'linear-gradient(0deg, rgba(244, 180, 66, 0.07) 0%, rgba(79, 157, 224, 0.05) 46%, rgba(79, 157, 224, 0) 100%)',
);
const FOOT_H = 190;
const RULE_H = 3;

// How far the artwork travels under the frame, as a fraction of the viewport,
// and the scale that keeps an edge out of the picture while it does. The scale
// floor is what bounds the pan: at scale S the frame hides (S - 1) / 2 of the
// width on each side, so raising the travel means raising the floor with it.
const PAN_X = 0.06;
const PAN_Y = 0.04;
const ZOOM: number[] = [1.16, 1.24];

// That travel is a FRACTION of the box, so the drift has to be given a speed
// rather than a duration: one fixed duration walks 82px on a phone and 246px
// on a 1080p panel, which reads as frozen on the one and as a pan on the
// other. The duration comes from the measured travel instead, so every screen
// drifts at the same pixels per second; the bounds keep a hairline box from
// strobing and a wall-sized one from stalling.
const DRIFT_PX_PER_S = 4;
const DRIFT_MIN_MS = 8000;
const DRIFT_MAX_MS = 60000;

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

/** The pan for one axis: the frame crawls from one side of its overscan to the
 *  other and back, as a fraction of the box it was measured against. */
function pan(clock: Animated.Value, by: number): Animated.AnimatedInterpolation<number> {
  return clock.interpolate({ inputRange: [0, 1], outputRange: [by, -by] });
}

/** One leg of the drift, in ms: the travel the pan covers across the measured
 *  box, walked at `DRIFT_PX_PER_S`. */
function legMs(width: number, height: number): number {
  const travel = Math.hypot(width * PAN_X * 2, height * PAN_Y * 2);
  return Math.min(Math.max((travel / DRIFT_PX_PER_S) * 1000, DRIFT_MIN_MS), DRIFT_MAX_MS);
}

/** 0..1 and back, `duration` each way, forever. */
function useLoop(duration: number): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const leg = {
      duration,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: !WEB,
    } as const;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, ...leg }),
        Animated.timing(value, { toValue: 0, ...leg }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [value, duration]);
  return value;
}

/** The universal sign-in splash: hosts fetch `/api/splash`, map it to covers
 * and drop this behind their gate. It owns the rotation, the pre-decode of the
 * next cover, the grade that keeps a form readable, the wheel rule and the
 * caption; the host owns everything interactive above it. */
function SplashBackdrop({ covers, holdMs = HOLD_MS, style }: Readonly<SplashBackdropProps>) {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (covers.length < 2) return;
    const timer = setInterval(() => setSlide((n) => n + 1), holdMs);
    return () => clearInterval(timer);
  }, [covers.length, holdMs]);

  // Warm the next cover through the whole hold, so a dissolve never starts
  // against a half-loaded image.
  useEffect(() => {
    if (covers.length < 2) return;
    const next = covers[(slide + 1) % covers.length];
    if (!next) return;
    if (WEB) {
      const img = (globalThis as { document?: Document }).document?.createElement('img');
      if (img) {
        img.src = next.url;
        img.decode?.().catch(() => undefined);
      }
    } else {
      RNImage.prefetch(next.url).catch(() => undefined);
    }
  }, [slide, covers]);

  // The drift is a pan across a frame held oversized for it, so no edge of the
  // artwork ever enters the picture. Measured off THIS box rather than off the
  // window: a host that gives the backdrop less than the whole screen still
  // keeps its edges out of frame. The same measurement times the crawl, so a
  // phone and a 65-inch panel drift at one speed.
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };
  const clock = useLoop(legMs(box.width, box.height));
  // Memoised: a fresh transform array hands <Animated.View> a new node graph to
  // tear down and re-attach, and on native that is bridge traffic for four
  // nodes - re-issued mid-animation on every render. The deps only move on a
  // genuine resize.
  const drift = useMemo(
    () => [
      { translateX: pan(clock, box.width * PAN_X) },
      { translateY: pan(clock, box.height * PAN_Y) },
      { scale: clock.interpolate({ inputRange: [0, 1], outputRange: ZOOM }) },
    ],
    [clock, box.width, box.height],
  );
  const cover = covers[slide % Math.max(covers.length, 1)];
  if (!cover) return null;

  return (
    <Box
      fill
      bg="bg"
      overflow="hidden"
      pointerEvents="none"
      aria-hidden
      onLayout={onLayout}
      style={style}
    >
      <Animated.View style={[s.art, WEB ? (s.grade as ViewStyle) : null, { transform: drift }]}>
        {/* The long dissolve belongs to the HANDOVER between two covers; the
            gate's first sight of any artwork takes the kit's short reveal
            instead, since a 2.8s ramp from the page colour reads as a fade
            from black rather than as a cross-fade. */}
        <Img
          src={cover.url}
          fill
          duration={slide === 0 ? IMG_FADE_MS : FADE_MS}
          position="50% 40%"
        />
      </Animated.View>
      <Box fill style={VEIL} />
      <Box fill style={VIGNETTE} />
      <Box absolute left={0} right={0} bottom={0} h={FOOT_H} style={FOOT} />
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
              <Txt variant="overline" color="white/50" style={s.eyebrow}>
                {cover.eyebrow}
              </Txt>
              <Box w={16} h={1} bg="white/30" />
            </>
          ) : null}
          <Txt color="white/90" lines={1} style={s.caption}>
            {cover.caption}
          </Txt>
        </Box>
      ) : null}
    </Box>
  );
}

const s = styles({
  art: { absolute: true, top: 0, right: 0, bottom: 0, left: 0 },
  eyebrow: { fontSize: 10, letterSpacing: 2.6, shrink: 0 },
  caption: { fontSize: 14, fontWeight: '500', shrink: 1 },
  // Web-tier CSS reached through the style escape hatch, exactly like the
  // NavPill's lens: this key is ignored by native.
  grade: { filter: 'brightness(0.86) saturate(1.02)' },
});

export type { SplashBackdropProps, SplashCover };
export { SplashBackdrop };
