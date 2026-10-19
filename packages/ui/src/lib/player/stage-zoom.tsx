import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Platform } from 'react-native';
import type { StageCard } from '#ui/components/organisms/player/lib/stage-card';
import { CARD_MS } from '#ui/components/organisms/player/lib/panel-slide';
import { style } from '#ui/core';
import { ease } from '#ui/lib/ease';

/** The settings card's corner radius, in canvas pixels. */
export const CARD_RADIUS = 72;

// Android is the one platform that cannot have the card's shape asked of it
// directly, and it fails two ways at once:
//
//  - a rounded clip on the box makes it render through an offscreen pass, and a
//    video texture whose parent renders offscreen loses its surface for good;
//  - a `transformOrigin` on a transformed view blanks the whole subtree, its own
//    background included.
//
// So there the corners are cut by a mask drawn over the picture, and the card is
// reached by scaling about the middle and translating the rest of the way.
// Everywhere else keeps the road it already had: the web box rounds its own
// child element, an AVPlayerLayer rounds itself off SurfaceRadiusProvider (see
// PlayerSurface), and the origin lands the card in one property.
const ANDROID = Platform.OS === 'android';

// A black frame whose INNER corners are the card's, drawn over the picture and
// clipped to it. Inner radius = borderRadius - borderWidth, hence the doubling.
// Always mounted, with the same geometry throughout; only its opacity moves,
// on the same value as the shrink.
const CORNER_MASK = style({
  position: 'absolute',
  left: -CARD_RADIUS,
  right: -CARD_RADIUS,
  top: -CARD_RADIUS,
  bottom: -CARD_RADIUS,
  borderWidth: CARD_RADIUS,
  borderColor: 'black',
  borderRadius: CARD_RADIUS * 2,
});

/** The radius the picture's box may round itself to: 0 where a rounded clip
 * would cost the video its surface, and the mask cuts the corners instead. */
export function cardCorner(radius: number): number {
  return ANDROID ? 0 : radius;
}

/** The stage's shrink progress, 0 full screen to 1 on the card. On the UI
 * thread: a scale is one of the two properties the native driver takes, and the
 * slowest box we support cannot spare a JS frame per frame. `active` is what
 * keeps a surface that does not scale from running it at all. */
export function useStageZoom(settingsShrink: boolean, active: boolean): Animated.Value {
  const [zoom] = useState(() => new Animated.Value(settingsShrink ? 1 : 0));
  useEffect(() => {
    if (!active) return;
    const anim = Animated.timing(zoom, {
      toValue: settingsShrink ? 1 : 0,
      duration: CARD_MS,
      easing: ease.out.native,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [settingsShrink, active, zoom]);
  return zoom;
}

const between = (zoom: Animated.Value, from: number, to: number) =>
  zoom.interpolate({ inputRange: [0, 1], outputRange: [from, to] });

// No native platform takes `transformOrigin`. Under a native-driver transform it
// blanks the whole subtree, its own background included, which is what left the
// card black on every engine. Native scales about the default middle and covers
// the rest with a translate instead, which is safe here because the pixel this
// is written in is the one `onLayout` measured. `stage-card` proves the two
// land identically.
/** The stage's transform onto the settings card. */
export function zoomStyle(zoom: Animated.Value, card: StageCard, width: number, _shrink: boolean) {
  return {
    transform: [
      { translateX: between(zoom, 0, card.shift * width) },
      { scale: between(zoom, 1, card.scale) },
    ],
  };
}

/** The frame that cuts the card's corners over the picture. Every native
 * surface takes it: an AVPlayerLayer is not clipped by a rounded ancestor
 * either, so on Apple TV the card came out square-cornered. */
export function StageCornerMask({ zoom }: Readonly<{ zoom: Animated.Value }>): ReactNode {
  return <Animated.View style={[CORNER_MASK, { opacity: zoom }]} pointerEvents="none" />;
}
