import {
  formatTimecode as fmtTime,
  type Marker,
  type RemoteKey,
  type ReportCategory,
} from '@kroma/core';
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { View, ViewStyle } from 'react-native';
import { Animated, Pressable, useWindowDimensions } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Spinner } from '#ui/components/atoms/spinner';
import { gradient } from '#ui/lib/css';
import { ease } from '#ui/lib/ease';
import { useLocale, useT } from '#ui/services/i18n';
import type { StoryboardTile } from '#ui/services/storyboard';
import { usePlayerCredits } from './hooks/usePlayerCredits';
import { usePlayerKeys } from './hooks/usePlayerKeys';
import { usePlayerNav } from './hooks/usePlayerNav';
import { useSeekNudge } from './hooks/useSeekNudge';
import { currentChapter, normalizeChapters } from './lib/chapters';
import { clamp01, endsAtClock, sliderToVolume, volumeToSlider } from './lib/fmt';
import type { PanelHandle } from './lib/nav';
import { injectStageStyles } from './lib/styles';
import type { SubtitleAppearance } from './lib/subtitle-appearance';
import { VIRTUAL_FOCUS } from './lib/virtual-focus';
import { ControlCluster } from './parts/ControlCluster';
import { CreditsCard, type CreditsCardItem } from './parts/CreditsCard';
import { SeekBar } from './parts/SeekBar';
import { SettingsPanel } from './parts/SettingsPanel';
import { SkipIntroButton } from './parts/SkipIntroButton';
import { StatsPanel } from './parts/StatsPanel';
import { SubtitleRenderer } from './parts/SubtitleRenderer';
import type { SubtitleGenBundle } from './parts/settings/gen';
import { SurfaceRadiusProvider } from './parts/surface-radius';
import { TopBar } from './parts/TopBar';
import { type UpNextData, type UpNextItem, UpNextSheet } from './parts/UpNextSheet';
import type { Chapter, PlaneRect, PlayerController, PlayerFlags } from './types';

export interface PlayerProps {
  controller: PlayerController;
  flags: PlayerFlags;
  title: string;
  subtitle?: string;
  /** Already-localized warning pill (codec / audio support), or null. */
  warn?: string | null;
  /** Raw chapter data (normalized here). */
  chapters?: Chapter[];
  /** Intro / credits markers (drives skip-intro + credits autoplay). */
  markers?: readonly Marker[];
  /** Storyboard preview tile at a position (null until the sheet is ready). */
  tileAt: (sec: number) => StoryboardTile | null;
  appearance: SubtitleAppearance;
  onAppearance: (next: Partial<SubtitleAppearance>) => void;
  subtitleGen: SubtitleGenBundle;
  /** Send a report about what is playing. Given one, the settings panel grows a
   * "Signaler un problème" row; without it, nothing changes. */
  onReport?: (category: ReportCategory) => Promise<void>;
  /** "À suivre" data (§10): next episodes + recommendations. */
  upNext: UpNextData;
  /** Play an up-next card (recommendation / next episode from the sheet). */
  onPlayItem?: (item: UpNextItem) => void;
  /** Next episode for the credits autoplay + the cluster next button (§11). */
  onPlayNext?: () => void;
  nextTitle?: CreditsCardItem | null;
  /** Skip-intro window (§13). */
  intro?: { active: boolean; onSkip: () => void };
  /** The video surface (an in-page <video> or a native-plane placeholder). */
  surface: ReactNode;
  /** Blocking admin-stop overlay (locks the transport when present). */
  terminated?: ReactNode;
  /** Floating toasts (resume prompt, etc.). */
  children?: ReactNode;
  /** The element that goes fullscreen on web (the player root). */
  /** The player's root host view. The web client keeps it to drive the browser
   *  Fullscreen API on the container. */
  rootRef?: React.Ref<View>;
  onClose: () => void;
}

function initialSettingsView(overlay: string | null): 'audio' | 'subtitles' | 'menu' {
  if (overlay === 'audio') return 'audio';
  if (overlay === 'subtitles') return 'subtitles';
  return 'menu';
}

/** The stage is pressable AND animated: one component, so the zoom below drives
 * the same element the pointer taps. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The settings panel's own width, mirrored from SettingsPanel's style so the
 * card can be centred in what is left of the screen rather than guessed at. */
const PANEL_FRACTION = 0.44;
const PANEL_MAX = 720;
/** Breathing room between the card and both the screen edge and the panel. */
const CARD_MARGIN = 64;
/** Drawn at the card's scale, so the on-screen radius is a fraction of this. */
const CARD_RADIUS = 72;
/** The zoom between fullscreen and card. */
const ZOOM_MS = 340;

/**
 * Where the video sits while the settings panel is open.
 *
 * Derived, not hard-coded: the card is as large as the space beside the panel
 * allows and centred in it. It used to be a flat half-scale nudged 3% in from
 * the left, which left the picture small and visibly off-centre, with far more
 * empty space on the panel side than on the outside.
 *
 * The scale is uniform, so the card's height fraction equals its width fraction
 * and `transformOrigin: '0 50%'` keeps it vertically centred for free.
 */
function cardGeometry(stageWidth: number): { scale: number; x: number; rect: PlaneRect } {
  const panel = Math.min(stageWidth * PANEL_FRACTION, PANEL_MAX);
  const free = Math.max(0, stageWidth - panel);
  const width = Math.max(0, free - CARD_MARGIN * 2);
  const scale = stageWidth > 0 ? width / stageWidth : 0.5;
  const x = (free - width) / 2;
  return {
    scale,
    x,
    // The same geometry as fractions, for a NATIVE plane (AVPlay / mpv /
    // ExoPlayer) that cannot be transformed and is moved with setPlaneRect.
    rect: { x: stageWidth > 0 ? x / stageWidth : 0, y: (1 - scale) / 2, w: scale, h: scale },
  };
}

/**
 * The stage's shrink into the settings card, as an animation.
 *
 * It used to be a style swap - one frame fullscreen, the next frame a card -
 * which on a television reads as a glitch rather than a transition. Driving it
 * from one 0→1 value zooms the picture down into the card and back out again.
 *
 * The JS driver, deliberately: `borderRadius` is not a native-driver property,
 * and the corners have to round IN STEP with the scale or the card is square
 * until the moment it lands. One value, one timeline.
 *
 * Native TV planes can't be transformed at all, so those never shrink
 * (settingsShrink stays false) and take the setPlaneRect path instead.
 */
function useStageZoom(settingsShrink: boolean, card: { scale: number; x: number }) {
  const zoom = useRef(new Animated.Value(settingsShrink ? 1 : 0)).current;
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
    style: {
      transformOrigin: '0 50%',
      transform: [
        // Pixels, not '3%': React Native cannot interpret a percentage in a
        // transform (react-native-web can, which is why it only broke on the TV).
        {
          translateX: zoom.interpolate({ inputRange: [0, 1], outputRange: [0, card.x] }),
        },
        { scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1, card.scale] }) },
      ],
      borderRadius: radius,
    },
  };
}

/**
 * Shrink a NATIVE video plane (AVPlay / mpv / ExoPlayer) into the settings card.
 * A hardware plane behind the page can't be CSS-transformed like an in-page
 * <video>, and ANIMATING its display rect (repeated setDisplayRect) reconfigures
 * the hardware scaler each call and lags badly on real TVs. So the plane SNAPS -
 * one resize to the card, one back to fullscreen - and the smooth part is the
 * rounded mask fading over it (a cheap GPU opacity transition). A no-op when
 * there's no plane to drive (in-page <video>, which the CSS transform handles).
 */
function useNativePlaneShrink(
  active: boolean,
  rect: PlaneRect,
  setPlaneRect: PlayerController['setPlaneRect'],
): void {
  // setPlaneRect is a stable callback (or undefined on web), so it can be a dep
  // directly - no latest-ref needed.
  useEffect(() => {
    setPlaneRect?.(active ? rect : null);
  }, [active, rect, setPlaneRect]);
  // Always restore fullscreen when the player tears down - otherwise leaving with
  // settings still open would strand the plane at card size (a small video stuck
  // upper-left) behind the next screen.
  useEffect(() => () => setPlaneRect?.(null), [setPlaneRect]);
}

/** Derived chrome-visibility flags, kept out of the component to stay flat. The
 * video only shrinks into a card for an IN-PAGE surface; native planes just get
 * the panel slid over them. */
function deriveChrome(
  nav: ReturnType<typeof usePlayerNav>,
  c: PlayerController,
  props: Readonly<PlayerProps>,
) {
  const settingsOpen =
    nav.overlay === 'settings' || nav.overlay === 'audio' || nav.overlay === 'subtitles';
  const sheetOpen = nav.overlay === 'sheet';
  const settingsShrink = settingsOpen && c.surface === 'video';
  const hasUpNext = props.upNext.nextEpisodes.length + props.upNext.recommendations.length > 0;
  const peekVisible = nav.revealed && hasUpNext && !settingsShrink && !nav.overlay;
  const chromeShown = nav.revealed && !nav.overlay;
  return { settingsOpen, sheetOpen, settingsShrink, peekVisible, chromeShown };
}

/** Credits card key routing: Left/Right swap Play/Cancel focus, OK fires the
 * focused one, Back cancels. Returns whether the key was consumed. */
function handleCreditsKey(
  key: RemoteKey,
  focus: 'play' | 'cancel',
  setFocus: Dispatch<SetStateAction<'play' | 'cancel'>>,
  onPlay: () => void,
  onCancel: () => void,
): boolean {
  if (key === 'Left' || key === 'Right') {
    setFocus((f) => (f === 'play' ? 'cancel' : 'play'));
    return true;
  }
  if (key === 'Enter') {
    if (focus === 'play') onPlay();
    else onCancel();
    return true;
  }
  if (key === 'Back') {
    onCancel();
    return true;
  }
  return false;
}

/** Pointer + keyboard handlers for the player root / stage, hoisted out of the
 * component so its cognitive complexity stays low. The stage click/key pair is a
 * pointer convenience (toggle play, double-click fullscreen); D-pad control still
 * flows through usePlayerKeys, so the key handler stops propagation. */
function playerInputHandlers(
  nav: ReturnType<typeof usePlayerNav>,
  c: PlayerController,
  flags: PlayerFlags,
  locked: boolean,
) {
  return {
    onPointerMove: (e: { nativeEvent?: { pointerType?: string } }) => {
      // Only a real fine pointer reveals the chrome. On TVs (flags.pointer false)
      // a magic-remote cursor emits phantom pointer moves that would keep the
      // chrome pinned open; the D-pad drives reveal there instead.
      if (flags.pointer && e.nativeEvent?.pointerType !== 'touch') nav.poke();
    },
    onStagePress: () => {
      if (!locked) {
        nav.poke();
        c.togglePlay();
      }
    },
    // The design's double-click-to-fullscreen. A long press is its cross-platform
    // spelling; `flags.fullscreen` is off on a TV, which is already fullscreen,
    // so this only ever fires in a browser.
    onStageLongPress: () => {
      if (flags.fullscreen) c.toggleFullscreen();
    },
  };
}

/**
 * The unified player chrome (§14): one component for web + TV. It owns the nav
 * machine, the keyboard router, the credits autoplay and the settings / PiP
 * video transforms, and composes every surface (top bar, chapter bar, control
 * cluster, settings panel, up-next sheet, subtitle renderer, overlays). The
 * platform provides a {@link PlayerController} + feature flags; nothing here
 * talks to an engine directly.
 */
export function Player(props: Readonly<PlayerProps>) {
  useEffect(injectStageStyles, []);
  const { controller: c, flags } = props;
  // The stage fills the screen, so the card is measured against this.
  const { width: stageWidth } = useWindowDimensions();
  const card = useMemo(() => cardGeometry(stageWidth), [stageWidth]);
  const t = useT();
  const locale = useLocale();

  const [statsOn, setStatsOn] = useState(false);
  const panelRef = useRef<PanelHandle>(null);
  const locked = Boolean(props.terminated);

  const chapters = useMemo(
    () => normalizeChapters(props.chapters, c.dur * 1000),
    [props.chapters, c.dur],
  );
  const shown = c.seekPreview ?? c.cur;
  const curChapter = currentChapter(chapters, shown * 1000);

  const credits = usePlayerCredits({
    markers: props.markers,
    dur: c.dur,
    cur: c.cur,
    seeking: c.seekPreview != null,
    endedNonce: c.endedNonce,
    hasNext: Boolean(props.onPlayNext),
    onAdvance: () => props.onPlayNext?.(),
  });
  const [creditsFocus, setCreditsFocus] = useState<'play' | 'cancel'>('play');
  useEffect(() => {
    if (credits.show) setCreditsFocus('play');
  }, [credits.show]);

  const seekNudge = useSeekNudge(c);
  const nav = usePlayerNav(flags, c.playing, {
    togglePlay: c.togglePlay,
    seekNudge,
    onNext: () => props.onPlayNext?.(),
    hasNext: Boolean(props.onPlayNext),
    // Step in perceptual slider space so a nudge feels even across the range.
    volumeNudge: (d) => c.setVolume(sliderToVolume(clamp01(volumeToSlider(c.volume) + d * 0.05))),
    toggleMute: c.toggleMute,
    togglePip: c.togglePip,
    toggleFullscreen: c.toggleFullscreen,
    onExit: props.onClose,
  });

  const creditsKey = (key: RemoteKey): boolean =>
    handleCreditsKey(
      key,
      creditsFocus,
      setCreditsFocus,
      () => props.onPlayNext?.(),
      credits.cancel,
    );

  usePlayerKeys({
    nav,
    controller: c,
    flags,
    panelRef,
    locked,
    intro: props.intro,
    credits: { active: credits.show, onKey: creditsKey },
  });

  const { settingsOpen, sheetOpen, settingsShrink, peekVisible, chromeShown } = deriveChrome(
    nav,
    c,
    props,
  );
  // A native plane (AVPlay / mpv / ExoPlayer) can't ride the CSS transform, so it
  // shrinks into the card via setPlaneRect; the returned rect drives a rounded
  // black mask over the surround. Web / HTML `<video>` surfaces stay on the CSS
  // path (nativeShrink is false / setPlaneRect absent).
  const nativeShrink = settingsOpen && c.surface !== 'video';
  const hasPlane = c.surface !== 'video' && Boolean(c.setPlaneRect);
  useNativePlaneShrink(nativeShrink, card.rect, c.setPlaneRect);
  const initialView = initialSettingsView(nav.overlay);
  // The stage (which holds the in-page <video>) transforms ONLY for a `video`
  // surface - never for a native plane, whose hardware layer some firmwares would
  // drag around if the <object> placeholder were CSS-transformed.
  const stage = useStageZoom(settingsShrink, card);
  // The buffering spinner + subtitle overlay ride into the card via their own
  // wrapper: on the CSS path they sit inside the (transformed) stage untouched; on
  // a native shrink the stage stays put, so the wrapper carries them down itself.
  // The SAME geometry the plane gets, not a second hand-written guess. The
  // spinner and subtitles have to land ON the shrunken picture, and the picture
  // is placed by `card.rect` - so a flat 3%/0.5, which is the shape the card had
  // before cardGeometry derived it, put them somewhere the video no longer was.
  const contentShrink: ViewStyle | undefined = nativeShrink
    ? { transformOrigin: '0 50%', transform: [{ translateX: card.x }, { scale: card.scale }] }
    : undefined;
  const endsAt = c.dur ? endsAtClock(Math.max(0, c.dur - c.cur) * 1000, locale) : '';
  // The top bar + transport hide while a panel / PiP owns the screen, and whenever
  // the chrome auto-hides (see `chromeShown`).
  const input = playerInputHandlers(nav, c, flags, locked);

  // Hoisted for the memoized sheet: an inline closure would hand it a new prop
  // every ~4 Hz tick and defeat the memo (nav's callbacks are stable).
  const openSheet = useCallback(() => nav.openOverlay('sheet'), [nav.openOverlay]);
  const playUpNextItem = useCallback(
    (item: UpNextItem) => props.onPlayItem?.(item),
    [props.onPlayItem],
  );

  return (
    <Box
      ref={props.rootRef}
      fill
      z={60}
      bg={c.surface === 'video' ? '#000000' : 'transparent'}
      onPointerMove={input.onPointerMove}
    >
      {/* Stage: the video surface, its subtitles and the buffering spinner,
          transformed together to shrink into the settings card.
          Its id is what the injected stylesheet hooks to size the in-page
          <video> a browser surface mounts here (see injectStageStyles); a native
          surface sizes itself and never sees that rule. */}
      <AnimatedPressable
        {...VIRTUAL_FOCUS}
        accessibilityRole="button"
        accessibilityLabel={c.playing ? t('player.pause') : t('player.play')}
        onPress={input.onStagePress}
        onLongPress={input.onStageLongPress}
        nativeID={STAGE_ID}
        style={[
          STAGE,
          settingsShrink ? { backgroundColor: '#000000', boxShadow: STAGE_SHADOW } : null,
          stage.style,
        ]}
      >
        {/* The surface rounds ITSELF to the card: a rounded parent does not clip
            a native video layer. Renders no element, so the web client's
            direct-child `<video>` rule still matches. */}
        <SurfaceRadiusProvider radius={stage.radius}>{props.surface}</SurfaceRadiusProvider>
        {/* The spinner + subtitles ride into the card: inside the transformed
            stage on the CSS path, or via this wrapper's own transform when a
            native plane shrinks (the stage itself must not move then). */}
        <Box fill overflow="hidden" pointerEvents="none" style={contentShrink}>
          <SubtitleRenderer
            positionSec={c.cur}
            playing={c.playing}
            subtitles={c.subtitles}
            activeIndex={c.subtitleIndex}
            appearance={props.appearance}
            raised={nav.revealed}
          />
          {c.waiting && !locked ? (
            <Box fill z={4} center>
              <Spinner size={56} thickness={3} />
            </Box>
          ) : null}
        </Box>
      </AnimatedPressable>

      {/* Native-plane shrink mask: the plane itself moves via setPlaneRect; this
          rounds the card corners and blacks out the surround (a hardware plane
          has no corner radius of its own). The geometry is STATIC, fixed at the
          card, and only the opacity changes, so the huge surround shadow
          rasterizes once instead of repainting every frame. Sits below the
          settings panel so the panel stays on top. */}
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
          pointerEvents="none"
          style={MASK_SURROUND}
        />
      ) : null}

      {/* skip intro (§13) */}
      {props.intro ? (
        <SkipIntroButton
          visible={props.intro.active}
          focused={props.intro.active && !nav.overlay && !credits.show}
          onSkip={props.intro.onSkip}
        />
      ) : null}

      {/* credits autoplay (§11) */}
      {credits.show && props.nextTitle ? (
        <CreditsCard
          item={props.nextTitle}
          secondsLeft={credits.secondsLeft}
          total={credits.total}
          playFocused={creditsFocus === 'play'}
          cancelFocused={creditsFocus === 'cancel'}
          onPlay={() => props.onPlayNext?.()}
          onCancel={credits.cancel}
        />
      ) : null}

      {/* stats (§9) */}
      {statsOn ? <StatsPanel controller={c} onClose={() => setStatsOn(false)} /> : null}

      {/* top bar */}
      <Box
        absolute
        left={0}
        right={0}
        top={0}
        z={20}
        opacity={chromeShown ? 1 : 0}
        pointerEvents={chromeShown ? 'box-none' : 'none'}
      >
        <TopBar
          title={props.title}
          subtitle={props.subtitle}
          warn={props.warn}
          onBack={props.onClose}
        />
      </Box>

      {/* up-next sheet (peek + expand, §10) */}
      <UpNextSheet
        ref={sheetOpen ? panelRef : null}
        data={props.upNext}
        open={sheetOpen}
        revealed={peekVisible || sheetOpen}
        onOpen={openSheet}
        onClose={nav.closeOverlay}
        onPlay={playUpNextItem}
      />

      {/* bottom chrome: chapter bar + control cluster. The gradient stays anchored
          to the screen bottom (never floated up), and the controls are lifted
          above the up-next peek with padding instead - so the peek (higher
          z-index) overlays the gradient's dark foot seamlessly rather than the
          gradient ending in a hard shadow band just above the peek. */}
      <Box
        absolute
        left={0}
        right={0}
        bottom={0}
        z={15}
        px={34}
        pt={80}
        pb={peekVisible ? 146 : 28}
        opacity={chromeShown ? 1 : 0}
        pointerEvents={chromeShown ? 'box-none' : 'none'}
        style={BOTTOM_SCRIM}
      >
        <SeekBar
          cur={c.cur}
          dur={c.dur}
          bufEnd={c.bufEnd}
          seekPreview={c.seekPreview}
          chapters={chapters}
          tileAt={props.tileAt}
          focused={nav.zone === 'progress'}
          elapsed={fmtTime(shown)}
          chapterLabel={curChapter?.title || undefined}
          total={fmtTime(c.dur)}
          endsAt={endsAt ? t('content.endsAtShort', { time: endsAt }) : ''}
          onScrub={c.scrubPreview}
          onScrubCommit={c.scrubCommit}
        />
        <ControlCluster
          controls={nav.controls}
          focused={nav.focusedControl}
          playing={c.playing}
          muted={c.muted}
          volume={c.volume}
          pipActive={c.pipActive}
          fullscreen={c.fullscreen}
          onActivate={nav.activate}
          onFocus={nav.focusControl}
          onVolume={c.setVolume}
        />
      </Box>

      {/* settings / audio / subtitles panel (§5) */}
      {settingsOpen ? (
        <SettingsPanel
          ref={panelRef}
          initialView={initialView}
          controller={c}
          appearance={props.appearance}
          onAppearance={props.onAppearance}
          statsOn={statsOn}
          onToggleStats={() => setStatsOn((s) => !s)}
          subtitleGen={props.subtitleGen}
          onReport={props.onReport}
          onClose={() => nav.closeOverlay()}
        />
      ) : null}

      {props.terminated}
      {props.children}
    </Box>
  );
}

/** Rendered as the element id on the web, which is what the injected stylesheet
 * hooks to size the in-page <video> a browser surface mounts here. */
const STAGE_ID = 'kroma-player-stage';

const STAGE = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 2,
  overflow: 'hidden' as const,
};

const STAGE_SHADOW = '0 20px 50px rgba(0, 0, 0, 0.55)';
/** A surround dark enough to read as "everything but the card is black". */
const MASK_SURROUND = { boxShadow: '0 0 0 100vmax #000' };
const BOTTOM_SCRIM = gradient('linear-gradient(0deg, rgba(0,0,0,0.82), transparent)');
