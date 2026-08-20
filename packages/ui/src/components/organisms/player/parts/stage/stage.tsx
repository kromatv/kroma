import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Spinner } from '#ui/components/atoms/spinner';
import { styles } from '#ui/core';
import { ease } from '#ui/lib/ease';
import { useT } from '#ui/services/i18n';
import { stageCard } from '../../lib/stage-card';
import { useStageRatio } from '../../lib/stage-ratio';
import { injectStageStyles } from '../../lib/styles';
import type { SubtitleAppearance } from '../../lib/subtitle-appearance';
import { VIRTUAL_FOCUS } from '../../lib/virtual-focus';
import type { PlaneRect, PlayerController } from '../../types';
import { SubtitleRenderer } from '../subtitle-renderer';
import { SurfaceRadiusProvider } from '../surface-radius';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const CARD_RADIUS = 72;
const ZOOM_MS = 340;

const pct = (fraction: number): `${number}%` => `${fraction * 100}%`;

// The JS driver, deliberately: `borderRadius` is not a native-driver property,
// and the corners have to round in step with the scale.
function useStageZoom(settingsShrink: boolean, card: { scale: number; origin: number }) {
  const [zoom] = useState(() => new Animated.Value(settingsShrink ? 1 : 0));
  useEffect(() => {
    const anim = Animated.timing(zoom, {
      toValue: settingsShrink ? 1 : 0,
      duration: ZOOM_MS,
      easing: ease.out.native,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [settingsShrink, zoom]);

  const radius = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, CARD_RADIUS] });
  return {
    radius,
    // A scale alone: `stageCard` picked the origin that lands the picture on the
    // card, so there is no translate to state in pixels the shell may have
    // scaled away under us.
    style: {
      transformOrigin: `${pct(card.origin)} 50%`,
      transform: [
        { scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1, card.scale] }) },
      ],
      borderRadius: radius,
    },
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
  settingsShrink: boolean;
  nativeShrink: boolean;
  appearance: SubtitleAppearance;
  raised: boolean;
  locked: boolean;
  onPress: () => void;
  onLongPress: () => void;
  children?: ReactNode;
}

function Stage({
  controller: c,
  stageSize,
  settingsShrink,
  nativeShrink,
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
  const hasPlane = c.surface !== 'video' && Boolean(c.setPlaneRect);
  useNativePlaneShrink(nativeShrink, card.rect, c.setPlaneRect);
  // Only an in-page `video` surface transforms: some firmwares drag the hardware
  // layer around if the native plane's <object> placeholder is CSS-transformed.
  const stage = useStageZoom(settingsShrink, card);
  // Clipped, so the card's corners round whatever the host mounted; a surface
  // that must round ITSELF (a hardware plane is not clipped by a parent) still
  // reads the same radius off SurfaceRadiusProvider.
  const pictureBox: ViewStyle = card.picture
    ? {
        position: 'absolute',
        overflow: 'hidden',
        left: pct(card.picture.x),
        top: pct(card.picture.y),
        width: pct(card.picture.width),
        height: pct(card.picture.height),
      }
    : s.picture;
  // On a native shrink the stage stays put, so this wrapper carries the spinner
  // and subtitles down itself - on the picture's box, which is what the transform
  // maps onto the card, so they land on the shrunken picture rather than beside it.
  const contentShrink: ViewStyle | undefined = nativeShrink
    ? {
        ...pictureBox,
        transformOrigin: `${pct(card.origin)} 50%`,
        transform: [{ scale: card.scale }],
      }
    : undefined;

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
        style={[s.stage, stage.style]}
      >
        {/* The picture's own box, so the shrink card hugs the film's shape
          instead of the window's. The surface rounds ITSELF on top of it: a
          rounded parent does not clip a native video layer. */}
        <Animated.View
          style={[pictureBox, { borderRadius: stage.radius }, settingsShrink ? s.card : null]}
        >
          <SurfaceRadiusProvider radius={stage.radius}>{children}</SurfaceRadiusProvider>
        </Animated.View>
        {/* Carries the spinner + subtitles into the card when a native plane
          shrinks; the stage itself must not move then. */}
        <Box style={[contentShrink ?? s.picture, s.inert]}>
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
        </Box>
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
          opacity={nativeShrink ? 1 : 0}
          style={s.maskSurround}
        />
      ) : null}
    </>
  );
}

const STAGE_ID = 'kroma-player-stage';

const STAGE_SHADOW = '0 20px 50px rgba(0, 0, 0, 0.55)';

const s = styles({
  stage: { fill: true, z: 2, overflow: 'hidden' },
  picture: { fill: true, overflow: 'hidden' },
  card: { bg: '#000000', boxShadow: STAGE_SHADOW },
  maskSurround: { boxShadow: '0 0 0 100vmax #000', pointerEvents: 'none' },
  inert: { pointerEvents: 'none' },
});

export { Stage };
