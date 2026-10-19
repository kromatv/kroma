import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { resolveStyles, type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { radius as cornerRadius } from '#ui/core/tokens';
import { NO_OUTLINE } from '#ui/lib/field-shell';
import {
  CARD_RADIUS,
  cardCorner,
  StageCornerMask,
  useStageZoom,
  zoomStyle,
} from '#ui/lib/player/stage-zoom';
import { useT } from '#ui/services/i18n';
import { CARD_MS } from '../../lib/panel-slide';
import { type StageCard, stageCard } from '../../lib/stage-card';
import { useStageRatio } from '#ui/lib/player/stage-ratio';
import { injectStageStyles } from '../../lib/styles';
import type { SubtitleAppearance } from '../../lib/subtitle-appearance';
import { surfaceShrink } from '../../lib/surface-shrink';
import { VIRTUAL_FOCUS } from '#ui/lib/player/virtual-focus';
import type { PlaneRect, PlayerController } from '../../types';
import { SubtitleRenderer } from '../subtitle-renderer';
import { SurfaceRadiusProvider } from '../surface-radius';
import { StageOverlay } from './stage-overlay';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const cornerOf = (radius: number, scope: StyleScope) =>
  sharedStyle(`stage:corner:${radius}`, { borderRadius: radius }, scope);

const pct = (fraction: number): `${number}%` => `${fraction * 100}%`;

// Snapped, not eased: a radius is not a native-driver property, and animating
// one would drag the whole shrink back onto the JS thread for a corner nobody
// watches round. It arrives with the card and leaves once the picture is back.
function useCardRadius(settingsShrink: boolean): number {
  const [rounded, setRounded] = useState(settingsShrink);
  if (settingsShrink && !rounded) setRounded(true);
  useEffect(() => {
    if (settingsShrink) return;
    const out = setTimeout(() => setRounded(false), CARD_MS);
    return () => clearTimeout(out);
  }, [settingsShrink]);
  return rounded ? CARD_RADIUS : 0;
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
function stageBoxes(
  card: StageCard,
  settingsShrink: boolean,
  planeShrink: boolean,
  scope: StyleScope,
) {
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
    : resolveStyles(sDefinition, scope).picture;
  // On a plane shrink the stage stays put and the picture's box moves to the
  // card, which is where the plane is asked to go, so a shell that measures the
  // box to place the plane lands it there too. This wrapper carries the spinner
  // and subtitles down itself, with the scale the stage would have taken.
  if (planeShrink) {
    const onCard: ViewStyle = {
      position: 'absolute',
      overflow: 'hidden',
      left: pct(card.rect.x),
      top: pct(card.rect.y),
      width: pct(card.rect.w),
      height: pct(card.rect.h),
    };
    return {
      picture: onCard,
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
  return { picture, content: settingsShrink ? picture : resolveStyles(sDefinition, scope).picture };
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
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

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
  const zoom = useStageZoom(settingsShrink, shrink === 'transform');
  const radius = useCardRadius(settingsShrink);
  const { picture: pictureBox, content: contentShrink } = stageBoxes(
    card,
    settingsShrink,
    planeShrink,
    scope,
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
          NO_OUTLINE,
          shrink === 'transform' ? zoomStyle(zoom, card, stageWidth, settingsShrink) : null,
        ]}
      >
        {/* The picture's own box, so the shrink card hugs the film's shape
          instead of the window's. Nothing here is added, removed or given a
          style key it did not already have when the card comes out: a video
          texture's surface does not survive its subtree being rebuilt. */}
        <Animated.View
          nativeID={PICTURE_ID}
          style={[pictureBox, cornerOf(cardCorner(radius), scope)]}
        >
          <SurfaceRadiusProvider radius={cardCorner(radius)}>{children}</SurfaceRadiusProvider>
          <StageCornerMask zoom={zoom} />
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
            onTrackFailed={c.markSubtitleFailed}
          />
          {locked ? null : (
            <StageOverlay
              error={c.error}
              hint={c.errorHint}
              waiting={c.waiting}
              reason={c.waitReason}
            />
          )}
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
          radius={cornerRadius.dialog}
          opacity={planeShrink ? 1 : 0}
          style={s.maskSurround}
        />
      ) : null}
    </>
  );
}

/** The picture box's DOM id: what web CSS sizes an in-page `<video>` through,
 * and what a shell measures to place a native plane behind the page. */
export const STAGE_ID = 'kroma-player-stage';

/** The picture's own box inside the stage: the card when the settings shrink
 * it, the whole stage otherwise. What a shell that cuts a native plane into the
 * page measures, since the plane has to sit exactly where the picture is. */
export const PICTURE_ID = 'kroma-player-picture';

const sDefinition = styles({
  stage: { fill: true, z: 2, overflow: 'hidden' },
  picture: { fill: true, overflow: 'hidden' },
  maskSurround: { boxShadow: '0 0 0 100vmax #000', pointerEvents: 'none' },
  inert: { pointerEvents: 'none' },
});

export { Stage };
