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
import type { LayoutChangeEvent, View, ViewStyle } from 'react-native';
import { Animated, Dimensions, Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Ground } from '#ui/components/atoms/ground';
import { Spinner } from '#ui/components/atoms/spinner';
import { styles } from '#ui/core';
import { gradient } from '#ui/lib/css';
import { ease } from '#ui/lib/ease';
import { useLocale, useT } from '#ui/services/i18n';
import type { StoryboardTile } from '#ui/services/storyboard';
import { usePlayerCredits } from './hooks/use-player-credits';
import { usePlayerKeys } from './hooks/use-player-keys';
import { usePlayerNav } from './hooks/use-player-nav';
import { useSeekNudge } from './hooks/use-seek-nudge';
import { currentChapter, normalizeChapters } from './lib/chapters';
import { clamp01, endsAtClock, sliderToVolume, volumeToSlider } from './lib/fmt';
import {
  CARD_MARGIN,
  chromeMetrics,
  GUTTER,
  panelGeometry,
  scaler,
  TRANSPORT_HEIGHT,
} from './lib/metrics';
import { type ControlId, controlOrder, type PanelHandle } from './lib/nav';
import { injectStageStyles } from './lib/styles';
import type { SubtitleAppearance } from './lib/subtitle-appearance';
import { VIRTUAL_FOCUS } from './lib/virtual-focus';
import { ControlCluster } from './parts/control-cluster';
import { CreditsCard, type CreditsCardItem } from './parts/credits-card';
import { SeekBar } from './parts/seek-bar';
import { SettingsPanel } from './parts/settings-panel';
import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';
import { SkipIntroButton } from './parts/skip-intro-button';
import { StatsPanel } from './parts/stats-panel';
import { SubtitleRenderer } from './parts/subtitle-renderer';
import { SurfaceRadiusProvider } from './parts/surface-radius';
import { TopBar } from './parts/top-bar';
import { PEEK_HEIGHT, type UpNextData, type UpNextItem, UpNextSheet } from './parts/up-next-sheet';
import { Actions, Media, Panel, PlayerSlotContext, sortSlots } from './player-parts';
import type {
  Chapter,
  PlaneRect,
  PlayerCloseDetails,
  PlayerCloseReason,
  PlayerController,
  PlayerFlags,
} from './types';

export interface PlayerRootProps {
  controller: PlayerController;
  flags: PlayerFlags;
  title: string;
  subtitle?: string;
  /** Pre-translated warning, drawn as a pill in the top bar; null to hide it. */
  warn?: string | null;
  chapters?: Chapter[];
  markers?: readonly Marker[];
  tileAt: (sec: number) => StoryboardTile | null;
  appearance: SubtitleAppearance;
  onAppearanceChange: (next: Partial<SubtitleAppearance>) => void;
  subtitleGen: SubtitleGenBundle;
  upNext: UpNextData;
  onReport?: (category: ReportCategory) => Promise<void>;
  onPlayItem?: (item: UpNextItem) => void;
  /** Given one, the chrome grows a "next" control and plays the credits card. */
  onPlayNext?: () => void;
  nextTitle?: CreditsCardItem | null;
  /** Whether the film is inside its detected intro window. The skip pill is only
   *  offered while this is true AND `onSkipIntro` is given. */
  introActive?: boolean;
  onSkipIntro?: () => void;
  onCast?: () => void;
  onClose: (details: PlayerCloseDetails) => void;
  ref?: React.Ref<View>;
  /** A <Player.Media>, then any of <Player.Actions> and <Player.Panel>. Only a
   *  DIRECT child takes its slot; anything else is drawn over the chrome, in the
   *  order it was written. */
  children?: ReactNode;
}

function initialSettingsView(overlay: string | null): 'audio' | 'subtitles' | 'menu' {
  if (overlay === 'audio') return 'audio';
  if (overlay === 'subtitles') return 'subtitles';
  return 'menu';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SKIP_GAP = 24;
const SKIP_REST = 56;
const CARD_RADIUS = 72;
const ZOOM_MS = 340;

// The scale is uniform, so the card's height fraction equals its width fraction
// and `transformOrigin: '0 50%'` keeps it vertically centred for free.
function cardGeometry(stageWidth: number): { scale: number; x: number; rect: PlaneRect } {
  const free = Math.max(0, stageWidth - panelGeometry(stageWidth).width);
  const width = Math.max(0, free - CARD_MARGIN * 2);
  const scale = stageWidth > 0 ? width / stageWidth : 0.5;
  const x = (free - width) / 2;
  return {
    scale,
    x,
    // The same geometry as fractions, for a native plane that cannot be
    // transformed and is moved with setPlaneRect instead.
    rect: { x: stageWidth > 0 ? x / stageWidth : 0, y: (1 - scale) / 2, w: scale, h: scale },
  };
}

// The JS driver, deliberately: `borderRadius` is not a native-driver property,
// and the corners have to round in step with the scale.
function useStageZoom(settingsShrink: boolean, card: { scale: number; x: number }) {
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
    style: {
      transformOrigin: '0 50%',
      transform: [
        // Pixels, not '3%': React Native cannot interpret a percentage in a
        // transform (react-native-web can, so this only broke on the TV).
        {
          translateX: zoom.interpolate({ inputRange: [0, 1], outputRange: [0, card.x] }),
        },
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

function deriveChrome(
  nav: ReturnType<typeof usePlayerNav>,
  c: PlayerController,
  upNext: UpNextData,
  panelCovers: boolean,
) {
  const settingsOpen =
    nav.overlay === 'settings' || nav.overlay === 'audio' || nav.overlay === 'subtitles';
  const sheetOpen = nav.overlay === 'sheet';
  const settingsShrink = settingsOpen && c.surface === 'video' && !panelCovers;
  const hasUpNext = upNext.nextEpisodes.length + upNext.recommendations.length > 0;
  const peekVisible = nav.revealed && hasUpNext && !settingsShrink && !nav.overlay;
  const chromeShown = nav.revealed && !nav.overlay;
  return { settingsOpen, sheetOpen, settingsShrink, peekVisible, chromeShown };
}

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

function playerInputHandlers(
  nav: ReturnType<typeof usePlayerNav>,
  c: PlayerController,
  flags: PlayerFlags,
  locked: boolean,
) {
  return {
    onPointerMove: (e: { nativeEvent?: { pointerType?: string } }) => {
      // On a TV (flags.pointer false) a magic-remote cursor emits phantom
      // pointer moves that would keep the chrome pinned open.
      if (flags.pointer && e.nativeEvent?.pointerType !== 'touch') nav.poke();
    },
    onStagePress: () => {
      if (!locked) {
        nav.poke();
        c.togglePlay();
      }
    },
    // A long press is the cross-platform spelling of double-click-to-fullscreen.
    onStageLongPress: () => {
      if (flags.fullscreen) c.toggleFullscreen();
    },
  };
}

/**
 * The unified player chrome (§14): one component for web + TV. The platform
 * provides a {@link PlayerController} and feature flags; nothing here talks to an
 * engine directly. It owns the stage, so give it the whole screen and exactly
 * one `<Player.Media>`.
 */
// Fully destructured, `ref` included: with React 19's ref-as-prop, keeping the
// props bag whole would make every `props.x` read a ref-aggregate access and
// cost the whole chrome its compiler memoisation.
function Root({
  controller: c,
  flags,
  title,
  subtitle,
  warn,
  chapters: rawChapters,
  markers,
  tileAt,
  appearance,
  onAppearanceChange,
  subtitleGen,
  upNext,
  onReport,
  onPlayItem,
  onPlayNext,
  nextTitle,
  introActive,
  onSkipIntro,
  onCast,
  onClose,
  ref,
  children,
}: Readonly<PlayerRootProps>) {
  useEffect(injectStageStyles, []);
  const slots = useMemo(() => sortSlots(children), [children]);
  // Seeded from the window so the first frame is not measured at zero, then kept
  // honest by the root's own layout. Read once rather than through
  // `useWindowDimensions`, which would subscribe to every resize event.
  const [stageWidth, setStageWidth] = useState(() => Dimensions.get('window').width);
  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width);
    setStageWidth((prev) => (prev === width || width <= 0 ? prev : width));
  }, []);
  const card = useMemo(() => cardGeometry(stageWidth), [stageWidth]);
  const t = useT();
  const locale = useLocale();

  const [statsOn, setStatsOn] = useState(false);
  const panelRef = useRef<PanelHandle>(null);
  const locked = slots.panel != null;
  const close = useCallback((reason: PlayerCloseReason) => onClose({ reason }), [onClose]);
  const closeFromChrome = useCallback(() => close('close'), [close]);
  const intro = useMemo(
    () => (onSkipIntro ? { active: introActive === true, onSkip: onSkipIntro } : undefined),
    [introActive, onSkipIntro],
  );

  const chapters = useMemo(
    () => normalizeChapters(rawChapters, c.dur * 1000),
    [rawChapters, c.dur],
  );
  const shown = c.seekPreview ?? c.cur;
  const curChapter = currentChapter(chapters, shown * 1000);

  const credits = usePlayerCredits({
    markers,
    dur: c.dur,
    cur: c.cur,
    seeking: c.seekPreview != null,
    endedNonce: c.endedNonce,
    hasNext: Boolean(onPlayNext),
    onAdvance: () => onPlayNext?.(),
  });
  const [creditsFocus, setCreditsFocus] = useState<'play' | 'cancel'>('play');
  useEffect(() => {
    if (credits.show) setCreditsFocus('play');
  }, [credits.show]);

  // Measured BEFORE the nav machine, which is then given the row that is drawn:
  // a shed control must not keep a focus stop.
  const row = useMemo(() => controlOrder(flags, Boolean(onPlayNext)), [flags, onPlayNext]);
  const metrics = useMemo(() => chromeMetrics(row, stageWidth), [row, stageWidth]);
  const px = scaler(metrics.scale);

  const seekNudge = useSeekNudge(c);
  const nav = usePlayerNav(
    c.playing,
    {
      togglePlay: c.togglePlay,
      seekNudge,
      onNext: () => onPlayNext?.(),
      hasNext: Boolean(onPlayNext),
      // Step in perceptual slider space so a nudge feels even across the range.
      volumeNudge: (d) => c.setVolume(sliderToVolume(clamp01(volumeToSlider(c.volume) + d * 0.05))),
      toggleMute: c.toggleMute,
      togglePip: c.togglePip,
      toggleFullscreen: c.toggleFullscreen,
      onCast,
      onExit: close,
    },
    metrics.controls,
  );

  const creditsKey = (key: RemoteKey): boolean =>
    handleCreditsKey(key, creditsFocus, setCreditsFocus, () => onPlayNext?.(), credits.cancel);

  usePlayerKeys({
    nav,
    controller: c,
    flags,
    panelRef,
    locked,
    intro,
    credits: { active: credits.show, onKey: creditsKey },
  });

  const panel = useMemo(() => panelGeometry(stageWidth), [stageWidth]);

  const { settingsOpen, sheetOpen, settingsShrink, peekVisible, chromeShown } = deriveChrome(
    nav,
    c,
    upNext,
    panel.covers,
  );
  const nativeShrink = settingsOpen && c.surface !== 'video' && !panel.covers;
  const hasPlane = c.surface !== 'video' && Boolean(c.setPlaneRect);
  useNativePlaneShrink(nativeShrink, card.rect, c.setPlaneRect);
  const initialView = initialSettingsView(nav.overlay);
  // Only an in-page `video` surface transforms: some firmwares drag the hardware
  // layer around if the native plane's <object> placeholder is CSS-transformed.
  const stage = useStageZoom(settingsShrink, card);
  // On a native shrink the stage stays put, so this wrapper carries the spinner
  // and subtitles down itself - on the same geometry the plane gets, so they land
  // on the shrunken picture.
  const contentShrink: ViewStyle | undefined = nativeShrink
    ? { transformOrigin: '0 50%', transform: [{ translateX: card.x }, { scale: card.scale }] }
    : undefined;
  const endsAt = c.dur ? endsAtClock(Math.max(0, c.dur - c.cur) * 1000, locale) : '';
  // Measured rather than assumed, and it falls back to the design height:
  // `onLayout` is a ResizeObserver under react-native-web, and the legacy TV tier
  // has none, so there the measurement never arrives at all.
  const [transportHeight, setTransportHeight] = useState(0);
  const onTransportLayout = useCallback((e: LayoutChangeEvent) => {
    const height = Math.round(e.nativeEvent.layout.height);
    setTransportHeight((prev) => (prev === height || height <= 0 ? prev : height));
  }, []);
  const transport = transportHeight || px(TRANSPORT_HEIGHT);
  const bottomInset = peekVisible ? PEEK_HEIGHT : px(28);
  const introLift = chromeShown ? bottomInset + transport + px(SKIP_GAP) : px(SKIP_REST);
  const input = playerInputHandlers(nav, c, flags, locked);

  const openSheet = () => nav.openOverlay('sheet');
  // Close first: pip, cast and the next episode all change what is on screen, and
  // leaving the panel over it would hide the thing just asked for.
  const runOverflow = (id: ControlId) => {
    nav.closeOverlay();
    nav.activate(id);
  };
  const playUpNextItem = useCallback((item: UpNextItem) => onPlayItem?.(item), [onPlayItem]);

  return (
    <PlayerSlotContext.Provider value={true}>
      <Box
        ref={ref}
        fill
        z={60}
        bg={c.surface === 'video' ? '#000000' : 'transparent'}
        onLayout={onStageLayout}
        onPointerMove={input.onPointerMove}
      >
        <Ground tone="dark" flex>
          {/* The id is what injectStageStyles hooks to size an in-page <video>; a
            native surface sizes itself and never sees that rule. */}
          <AnimatedPressable
            {...VIRTUAL_FOCUS}
            accessibilityRole="button"
            accessibilityLabel={c.playing ? t('player.pause') : t('player.play')}
            onPress={input.onStagePress}
            onLongPress={input.onStageLongPress}
            nativeID={STAGE_ID}
            style={[
              s.stage,
              settingsShrink ? { backgroundColor: '#000000', boxShadow: STAGE_SHADOW } : null,
              stage.style,
            ]}
          >
            {/* The surface rounds ITSELF: a rounded parent does not clip a native
              video layer. Renders no element, so the web client's direct-child
              `<video>` rule still matches. */}
            <SurfaceRadiusProvider radius={stage.radius}>{slots.media}</SurfaceRadiusProvider>
            {/* Carries the spinner + subtitles into the card when a native plane
              shrinks; the stage itself must not move then. */}
            <Box fill overflow="hidden" style={[s.inert, contentShrink]}>
              <SubtitleRenderer
                positionSec={c.cur}
                playing={c.playing}
                subtitles={c.subtitles}
                activeIndex={c.subtitleIndex}
                appearance={appearance}
                raised={nav.revealed}
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

          {/* skip intro (§13) */}
          {intro ? (
            <SkipIntroButton
              visible={intro.active}
              focused={intro.active && !nav.overlay && !credits.show}
              scale={metrics.scale}
              lift={introLift}
              onSkip={intro.onSkip}
            />
          ) : null}

          {/* credits autoplay (§11) */}
          {credits.show && nextTitle ? (
            <CreditsCard
              item={nextTitle}
              secondsLeft={credits.secondsLeft}
              total={credits.total}
              playFocused={creditsFocus === 'play'}
              cancelFocused={creditsFocus === 'cancel'}
              scale={metrics.scale}
              onPlay={() => onPlayNext?.()}
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
            style={chromeShown ? s.chromeLive : s.inert}
          >
            <TopBar
              title={title}
              subtitle={subtitle}
              warn={warn}
              actions={slots.actions}
              scale={metrics.scale}
              backFocused={nav.zone === 'back'}
              onBack={closeFromChrome}
            />
          </Box>

          {/* up-next sheet (peek + expand, §10) */}
          <UpNextSheet
            ref={sheetOpen ? panelRef : null}
            data={upNext}
            open={sheetOpen}
            revealed={peekVisible || sheetOpen}
            onOpen={openSheet}
            onClose={nav.closeOverlay}
            onPlay={playUpNextItem}
          />

          {/* The gradient stays anchored to the screen bottom and the controls are
            lifted above the up-next peek with padding instead, so the peek overlays
            its dark foot rather than the gradient ending in a hard band. */}
          <Box
            absolute
            left={0}
            right={0}
            bottom={0}
            z={15}
            px={px(GUTTER)}
            pt={px(80)}
            // Not scaled: it is the peek's own height, from the sheet that draws it.
            pb={bottomInset}
            opacity={chromeShown ? 1 : 0}
            style={[chromeShown ? s.chromeLive : s.inert, BOTTOM_SCRIM]}
          >
            {/* Measured so the skip-intro pill can sit clear of it; the layout is
              kept while the chrome fades (opacity, not display). */}
            <Box onLayout={onTransportLayout}>
              <SeekBar
                cur={c.cur}
                dur={c.dur}
                bufEnd={c.bufEnd}
                seekPreview={c.seekPreview}
                chapters={chapters}
                tileAt={tileAt}
                focused={nav.zone === 'progress'}
                elapsed={fmtTime(shown)}
                chapterLabel={curChapter?.title || undefined}
                total={fmtTime(c.dur)}
                endsAt={endsAt ? t('content.endsAtShort', { time: endsAt }) : ''}
                scale={metrics.scale}
                onScrub={c.scrubPreview}
                onScrubCommit={c.scrubCommit}
              />
              <ControlCluster
                focused={nav.focusedControl}
                playing={c.playing}
                muted={c.muted}
                volume={c.volume}
                pipActive={c.pipActive}
                fullscreen={c.fullscreen}
                metrics={metrics}
                onActivate={nav.activate}
                onFocus={nav.focusControl}
                onVolume={c.setVolume}
              />
            </Box>
          </Box>

          {/* settings / audio / subtitles panel (§5) */}
          {settingsOpen ? (
            <SettingsPanel
              ref={panelRef}
              initialView={initialView}
              width={panel.width}
              covers={panel.covers}
              scale={metrics.scale}
              controller={c}
              appearance={appearance}
              onAppearanceChange={onAppearanceChange}
              statsOn={statsOn}
              onToggleStats={() => setStatsOn((s) => !s)}
              subtitleGen={subtitleGen}
              onReport={onReport}
              overflow={metrics.overflow}
              onControl={runOverflow}
              onClose={() => nav.closeOverlay()}
            />
          ) : null}

          {slots.panel}
          {slots.rest}
        </Ground>
      </Box>
    </PlayerSlotContext.Provider>
  );
}

const STAGE_ID = 'kroma-player-stage';

const STAGE_SHADOW = '0 20px 50px rgba(0, 0, 0, 0.55)';
const BOTTOM_SCRIM = gradient('linear-gradient(0deg, rgba(0,0,0,0.82), transparent)');

const s = styles({
  stage: { fill: true, z: 2, overflow: 'hidden' },
  maskSurround: { boxShadow: '0 0 0 100vmax #000', pointerEvents: 'none' },
  inert: { pointerEvents: 'none' },
  chromeLive: { pointerEvents: 'box-none' },
});

const Player = { Root, Media, Actions, Panel };

export { Player };
