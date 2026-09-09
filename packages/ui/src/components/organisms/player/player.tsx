import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';
import { Dimensions } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Ground } from '#ui/components/atoms/ground';
import { styles } from '#ui/core';
import { PLAYER_ROOT_ID, useIdleCursor } from './hooks/use-idle-cursor';
import { usePlayerEnding } from './hooks/use-player-ending';
import { usePlayerKeys } from './hooks/use-player-keys';
import { usePlayerNav } from './hooks/use-player-nav';
import { useSeekNudge } from './hooks/use-seek-nudge';
import { clamp01, sliderToVolume, volumeToSlider } from './lib/fmt';
import { chromeMetrics, panelGeometry, scaler, TRANSPORT_HEIGHT } from './lib/metrics';
import { type ControlId, controlOrder, type PanelHandle } from './lib/nav';
import { usePanelSlide } from './lib/panel-slide';
import { DEFAULT_SUB_APPEARANCE } from './lib/subtitle-appearance';
import { surfaceShrink } from './lib/surface-shrink';
import { CreditsCard } from './parts/credits-card';
import { PostPlay } from './parts/post-play';
import { SettingsPanel } from './parts/settings-panel';
import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';
import { SkipIntroButton } from './parts/skip-intro-button';
import { Stage } from './parts/stage';
import { StatsPanel } from './parts/stats-panel';
import { TopBar } from './parts/top-bar';
import { Transport } from './parts/transport';
import { PEEK_HEIGHT, type UpNextData, type UpNextItem, UpNextSheet } from './parts/up-next-sheet';
import { deriveChrome, initialSettingsView } from './player-chrome-state';
import { playerInputHandlers } from './player-input';
import {
  Actions,
  Credits as CreditsSlot,
  Media,
  Panel,
  PlayerSlotContext,
  PostPlay as PostPlaySlot,
  Report,
  SkipIntro as SkipIntroSlot,
  Subtitle,
  Subtitles,
  sortSlots,
  Title,
  Transport as TransportSlot,
  UpNext as UpNextSlot,
  Warning,
} from './player-parts';
import type { PlayerCloseDetails, PlayerCloseReason, PlayerController, PlayerFlags } from './types';

export interface PlayerRootProps {
  controller: PlayerController;
  flags: PlayerFlags;
  /** What is playing, as a name for assistive tech and for the end card. It
   *  draws nothing: `<Player.Title>` is what puts it on screen. */
  title: string;
  onCast?: () => void;
  onClose: (details: PlayerCloseDetails) => void;
  ref?: React.Ref<View>;
  /** The parts. A `<Player.Media>`, then any of the faces (`Title`, `Subtitle`,
   *  `Warning`, `Actions`, `Panel`) and the settings (`Transport`, `UpNext`,
   *  `Credits`, `PostPlay`, `SkipIntro`, `Subtitles`, `Report`). Only a DIRECT
   *  child takes its slot; anything else is drawn over the chrome, in the order
   *  it was written. */
  children?: ReactNode;
}

const NO_UP_NEXT: UpNextData = { nextEpisodes: [], recommendations: [] };
const NO_TILE = () => null;
const NO_APPEARANCE_CHANGE = () => undefined;
const NO_SUBTITLE_GEN: SubtitleGenBundle = {
  canCreate: false,
  caps: null,
  pending: [],
  onCancel: () => undefined,
  onDelete: () => undefined,
  onStart: () => undefined,
};

const SKIP_GAP = 24;
const SKIP_REST = 56;

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
  onCast,
  onClose,
  ref,
  children,
}: Readonly<PlayerRootProps>) {
  const slots = useMemo(() => sortSlots(children), [children]);
  const upNext = slots.upNext?.data ?? NO_UP_NEXT;
  const onPlayItem = slots.upNext?.onPlay;
  const markers = slots.credits?.markers;
  const nextTitle = slots.credits?.next ?? null;
  const onPlayNext = slots.credits?.onPlay;
  const postPlay = slots.postPlay?.item ?? null;
  const onGoHome = slots.postPlay?.onHome;
  const introActive = slots.skipIntro?.active;
  const onSkipIntro = slots.skipIntro?.onSkip;
  const appearance = slots.subtitles?.appearance ?? DEFAULT_SUB_APPEARANCE;
  const onAppearanceChange = slots.subtitles?.onAppearanceChange ?? NO_APPEARANCE_CHANGE;
  const subtitleGen = slots.subtitles?.gen ?? NO_SUBTITLE_GEN;
  const onReport = slots.report?.onReport;
  const rawChapters = slots.transport?.chapters;
  const tileAt = slots.transport?.tileAt ?? NO_TILE;
  // Seeded from the window so the first frame is not measured at zero, then kept
  // honest by the root's own layout. Read once rather than through
  // `useWindowDimensions`, which would subscribe to every resize event.
  const [stageSize, setStageSize] = useState(() => {
    const window = Dimensions.get('window');
    return { width: window.width, height: window.height };
  });
  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const next = { width: Math.round(width), height: Math.round(height) };
    setStageSize((prev) =>
      (prev.width === next.width && prev.height === next.height) || next.width <= 0 ? prev : next,
    );
  }, []);
  const [statsOn, setStatsOn] = useState(false);
  const panelRef = useRef<PanelHandle>(null);
  const locked = slots.panel != null;
  const close = useCallback((reason: PlayerCloseReason) => onClose({ reason }), [onClose]);
  const closeFromChrome = useCallback(() => close('close'), [close]);
  const intro = useMemo(
    () => (onSkipIntro ? { active: introActive === true, onSkip: onSkipIntro } : undefined),
    [introActive, onSkipIntro],
  );

  // Measured BEFORE the nav machine, which is then given the row that is drawn:
  // a shed control must not keep a focus stop.
  const row = useMemo(() => controlOrder(flags, Boolean(onPlayNext)), [flags, onPlayNext]);
  const metrics = useMemo(() => chromeMetrics(row, stageSize.width), [row, stageSize.width]);
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

  useIdleCursor(flags.pointer && !nav.revealed);

  const ending = usePlayerEnding({
    controller: c,
    markers,
    postPlay,
    onPlayNext,
    onPlayItem,
    onGoHome,
    onLeave: () => close('ended'),
    onClearOverlay: nav.closeOverlay,
  });
  const credits = ending.credits;

  usePlayerKeys({
    nav,
    controller: c,
    flags,
    panelRef,
    locked,
    intro,
    credits: { active: credits.show, onKey: ending.onCreditsKey },
    postPlay: { active: ending.over, onKey: ending.onPostPlayKey },
  });

  const panel = useMemo(() => panelGeometry(stageSize.width), [stageSize.width]);

  const { settingsOpen, sheetOpen, settingsShrink, peekVisible, chromeShown } = deriveChrome(
    nav,
    upNext,
    panel.covers,
    ending.over,
  );
  const settings = usePanelSlide(settingsOpen);
  const initialView = initialSettingsView(nav.overlay);
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
        nativeID={PLAYER_ROOT_ID}
        fill
        z={60}
        // Transparent ONLY over a hardware plane, which is behind the page and
        // would be painted out; a surface React lays out sits on this ground.
        bg={surfaceShrink(c.surface) === 'plane' ? 'transparent' : '#000000'}
        onLayout={onStageLayout}
        onPointerMove={input.onPointerMove}
      >
        <Ground tone="dark" flex>
          <Stage
            controller={c}
            stageSize={stageSize}
            settingsShrink={settingsShrink}
            appearance={appearance}
            raised={nav.revealed}
            locked={locked}
            onPress={input.onStagePress}
            onLongPress={input.onStageLongPress}
          >
            {slots.media}
          </Stage>

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
              playFocused={ending.creditsFocus === 'play'}
              cancelFocused={ending.creditsFocus === 'cancel'}
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
              title={slots.title}
              subtitle={slots.subtitle}
              warn={slots.warning}
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

          <Transport
            controller={c}
            chapters={rawChapters}
            tileAt={tileAt}
            metrics={metrics}
            nav={nav}
            chromeShown={chromeShown}
            bottomInset={bottomInset}
            onLayout={onTransportLayout}
          />

          {/* settings / audio / subtitles panel (§5) */}
          {settings.mounted ? (
            <SettingsPanel
              key={settings.run}
              ref={panelRef}
              shown={settings.shown}
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

          {/* end of the film (§10) */}
          {ending.over && postPlay ? (
            <PostPlay
              item={postPlay}
              finished={title}
              focus={ending.postPlayFocus}
              stageWidth={stageSize.width}
              onPlay={ending.playOffer}
              onHome={ending.goHome}
            />
          ) : null}

          {slots.panel}
          {slots.rest}
        </Ground>
      </Box>
    </PlayerSlotContext.Provider>
  );
}

const s = styles({
  inert: { pointerEvents: 'none' },
  chromeLive: { pointerEvents: 'box-none' },
});

const Player = {
  Root,
  Media,
  Actions,
  Panel,
  Title,
  Subtitle,
  Warning,
  Transport: TransportSlot,
  UpNext: UpNextSlot,
  Credits: CreditsSlot,
  PostPlay: PostPlaySlot,
  SkipIntro: SkipIntroSlot,
  Subtitles,
  Report,
};

export { Player };
