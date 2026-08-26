import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Spinner } from '#ui/components/atoms/spinner';
import { styles } from '#ui/core';
import { ease } from '#ui/lib/ease';
import { WEB } from '#ui/lib/platform';
import { useT } from '#ui/services/i18n';
import { CARD_MS } from '../../lib/panel-slide';
import { type StageCard, stageCard } from '../../lib/stage-card';
import { useStageRatio } from '../../lib/stage-ratio';
import { injectStageStyles } from '../../lib/styles';
import type { SubtitleAppearance } from '../../lib/subtitle-appearance';
import { surfaceShrink } from '../../lib/surface-shrink';
import { VIRTUAL_FOCUS } from '../../lib/virtual-focus';
import type { PlaneRect, PlayerController } from '../../types';
import { SubtitleRenderer } from '../subtitle-renderer';
import { SurfaceRadiusProvider } from '../surface-radius';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const CARD_RADIUS = 72;

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
const CORNER_MASK: ViewStyle = {
  position: 'absolute',
  left: -CARD_RADIUS,
  right: -CARD_RADIUS,
  top: -CARD_RADIUS,
  bottom: -CARD_RADIUS,
  borderWidth: CARD_RADIUS,
  borderColor: '#000000',
  borderRadius: CARD_RADIUS * 2,
};

const pct = (fraction: number): `${number}%` => `${fraction * 100}%`;

// On the UI thread: a scale is one of the two properties the native driver
// takes, and the slowest box we support cannot spare a JS frame per frame.
// `active` is what keeps a surface that does not scale from running it at all.
function useStageZoom(settingsShrink: boolean, active: boolean): Animated.Value {
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

// Snapped, not eased: a radius is not a native-driver property, and animating
// one would drag the whole shrink back onto the JS thread for a corner nobody
// watches round. It arrives with the card and leaves once the picture is back.
function useCardRadius(settingsShrink: boolean): number {
  const [rounded, setRounded] = useState(settingsShrink);
  useEffect(() => {
    if (settingsShrink) {
      setRounded(true);
      return;
    }
    const out = setTimeout(() => setRounded(false), CARD_MS);
    return () => clearTimeout(out);
  }, [settingsShrink]);
  return rounded ? CARD_RADIUS : 0;
}

const between = (zoom: Animated.Value, from: number, to: number) =>
  zoom.interpolate({ inputRange: [0, 1], outputRange: [from, to] });

// The browsers do not have `Animated`'s native driver at all: react-native-web
// warns once and falls back to a JS animation, so every frame of the shrink
// would be a render on the same thread the chrome ticks on. A CSS transition
// hands the whole movement to the compositor instead and costs one style write,
// which on a television is the difference between a shrink and a stutter.
function webZoomStyle(shrink: boolean, card: StageCard): ViewStyle {
  return {
    transformOrigin: `${pct(card.origin)} 50%`,
    transform: `scale(${shrink ? card.scale : 1})`,
    transitionProperty: 'transform',
    transitionDuration: `${CARD_MS}ms`,
    transitionTimingFunction: ease.out.css,
    // Asked for up front, so the first frame of the shrink is not also the frame
    // that promotes the layer.
    willChange: 'transform',
  } as ViewStyle;
}

// `transformOrigin` is the web's road, and only the web's: a television shell
// CSS-scales its whole canvas, so a pixel written back there is read at layout
// size while `onLayout` reported the scaled one, and the origin is the one way
// to say it without a unit.
//
// No native platform takes it. Under a native-driver transform it blanks the
// whole subtree, its own background included, which is what left the card black
// on every engine. Native scales about the default middle and covers the rest
// with a translate instead, which is safe there precisely because that
// pixel-versus-layout mismatch is a web trick: the pixel this is written in is
// the one `onLayout` measured. `stage-card` proves the two land identically.
function zoomStyle(zoom: Animated.Value, card: StageCard, width: number, shrink: boolean) {
  if (WEB) return webZoomStyle(shrink, card);
  return {
    transform: [
      { translateX: between(zoom, 0, card.shift * width) },
      { scale: between(zoom, 1, card.scale) },
    ],
  };
}

// A hardware plane behind the page can't be CSS-transformed, and animating its
// display rect reconfigures the hardware scaler on every call and lags badly on
// real TVs, so the plane snaps and only the rounded mask over it fades.
function useNativePlaneShrink(
  active: boolean,
  rect: PlaneRect,
  setPlaneRect: PlayerController['setPlaneRect'],
): void {
  useEffect(() => {
    setPlaneRect?.(active ? rect : null);
  }, [active, rect, setPlaneRect]);
  // Restore fullscreen on teardown, or leaving with settings open strands the
  // plane at card size behind the next screen.
  useEffect(() => () => setPlaneRect?.(null), [setPlaneRect]);
}

interface StageProps {
  controller: PlayerController;
  /** The stage's measured size. Only ever read as a ratio, so the unit the
   *  shell reports it in does not matter. */
  stageSize: { width: number; height: number };
  /** The picture is on the settings card. WHICH hold that takes is read off the
   *  surface here (../../lib/surface-shrink), not decided by the caller. */
  settingsShrink: boolean;
  appearance: SubtitleAppearance;
  raised: boolean;
  locked: boolean;
  onPress: () => void;
  onLongPress: () => void;
  children?: ReactNode;
}

// Where the picture sits, and where its captions and spinner sit with it. Its
// own function because this is geometry rather than rendering, and reading
// <Stage> should not mean holding three box ternaries at the same time.
function stageBoxes(card: StageCard, settingsShrink: boolean, planeShrink: boolean) {
  // Clipped, so the card's corners round whatever the host mounted; a surface
  // that must round ITSELF (a hardware plane is not clipped by a parent) still
  // reads the same radius off SurfaceRadiusProvider.
  const picture: ViewStyle = card.picture
    ? {
        position: 'absolute',
        overflow: 'hidden',
        left: pct(card.picture.x),
        top: pct(card.picture.y),
        width: pct(card.picture.width),
        height: pct(card.picture.height),
      }
    : s.picture;
  // On a plane shrink the stage stays put, so this wrapper carries the spinner
  // and subtitles down itself, with the scale the stage would have taken.
  if (planeShrink) {
    return {
      picture,
      content: {
        ...picture,
        transformOrigin: `${pct(card.origin)} 50%`,
        transform: [{ scale: card.scale }],
      },
    };
  }
  // Anchored to the PICTURE once the card is out, rather than to the stage: the
  // card IS the picture's box, and a caption left on the stage's bottom edge
  // would sit outside it on a letterboxed film.
  return { picture, content: settingsShrink ? picture : s.picture };
}

function Stage({
  controller: c,
  stageSize,
  settingsShrink,
  appearance,
  raised,
  locked,
  onPress,
  onLongPress,
  children,
}: Readonly<StageProps>) {
  useEffect(injectStageStyles, []);
  const t = useT();
  const stageWidth = stageSize.width;
  // The stage's shape, which a television shell's window does not share: it fits
  // a 1920x1080 canvas into the window it was given and keeps a surround.
  const stageRatio = useStageRatio(
    STAGE_ID,
    stageSize.height > 0 ? stageSize.width / stageSize.height : 16 / 9,
  );
  const card = useMemo(
    () => stageCard(stageWidth, stageWidth / stageRatio, c.aspect),
    [stageWidth, stageRatio, c.aspect],
  );
  const shrink = surfaceShrink(c.surface);
  const planeShrink = shrink === 'plane' && settingsShrink;
  const hasPlane = shrink === 'plane' && Boolean(c.setPlaneRect);
  useNativePlaneShrink(planeShrink, card.rect, c.setPlaneRect);
  const zoom = useStageZoom(settingsShrink, shrink === 'transform' && !WEB);
  const radius = useCardRadius(settingsShrink);
  const { picture: pictureBox, content: contentShrink } = stageBoxes(
    card,
    settingsShrink,
    planeShrink,
  );

  return (
    <>
      {/* The id is what injectStageStyles hooks to size an in-page <video>; a
        native surface sizes itself and never sees that rule. */}
      <AnimatedPressable
        {...VIRTUAL_FOCUS}
        accessibilityRole="button"
        accessibilityLabel={c.playing ? t('player.pause') : t('player.play')}
        onPress={onPress}
        onLongPress={onLongPress}
        nativeID={STAGE_ID}
        style={[
          s.stage,
          shrink === 'transform' ? zoomStyle(zoom, card, stageWidth, settingsShrink) : null,
        ]}
      >
        {/* The picture's own box, so the shrink card hugs the film's shape
          instead of the window's. Nothing here is added, removed or given a
          style key it did not already have when the card comes out: a video
          texture's surface does not survive its subtree being rebuilt. */}
        <Animated.View style={[pictureBox, { borderRadius: ANDROID ? 0 : radius }]}>
          <SurfaceRadiusProvider radius={ANDROID ? 0 : radius}>{children}</SurfaceRadiusProvider>
          {/* Every native surface takes the mask, not just Android's texture: an
            AVPlayerLayer is not clipped by a rounded ancestor either (see
            PlayerSurface), so on Apple TV the card came out square-cornered.
            Cutting the corners with a frame over the picture is the one way
            that works whatever the platform hands the layer to. */}
          {WEB ? null : (
            <Animated.View style={[CORNER_MASK, { opacity: zoom }]} pointerEvents="none" />
          )}
        </Animated.View>
        {/* Carries the spinner + subtitles onto the card. The stage itself does
          not move on a plane shrink, so there this box takes the scale. */}
        <Animated.View style={[contentShrink, s.inert]}>
          <SubtitleRenderer
            positionSec={c.cur}
            playing={c.playing}
            subtitles={c.subtitles}
            activeIndex={c.subtitleIndex}
            appearance={appearance}
            raised={raised}
          />
          {c.waiting && !locked ? (
            <Box fill z={4} center>
              <Spinner size={56} thickness={3} />
            </Box>
          ) : null}
        </Animated.View>
      </AnimatedPressable>

      {/* A hardware plane has no corner radius of its own, so this masks the
        card. Static geometry with only the opacity animated, so the surround
        shadow rasterizes once instead of repainting every frame. */}
      {hasPlane ? (
        <Box
          absolute
          left={`${card.rect.x * 100}%`}
          top={`${card.rect.y * 100}%`}
          w={`${card.rect.w * 100}%`}
          h={`${card.rect.h * 100}%`}
          z={3}
          radius={24}
          opacity={planeShrink ? 1 : 0}
          style={s.maskSurround}
        />
      ) : null}
    </>
  );
}

const STAGE_ID = 'kroma-player-stage';

const s = styles({
  stage: { fill: true, z: 2, overflow: 'hidden' },
  picture: { fill: true, overflow: 'hidden' },
  maskSurround: { boxShadow: '0 0 0 100vmax #000', pointerEvents: 'none' },
  inert: { pointerEvents: 'none' },
});

export { Stage };
