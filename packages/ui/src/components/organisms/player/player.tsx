import type { Marker, RemoteKey, ReportCategory } from '@kroma/core';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';
import { Dimensions } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Ground } from '#ui/components/atoms/ground';
import { styles } from '#ui/core';
import type { StoryboardTile } from '#ui/services/storyboard';
import { usePlayerCredits } from './hooks/use-player-credits';
import { usePlayerKeys } from './hooks/use-player-keys';
import { usePlayerNav } from './hooks/use-player-nav';
import { useSeekNudge } from './hooks/use-seek-nudge';
import { clamp01, sliderToVolume, volumeToSlider } from './lib/fmt';
import { chromeMetrics, panelGeometry, scaler, TRANSPORT_HEIGHT } from './lib/metrics';
import { type ControlId, controlOrder, type PanelHandle } from './lib/nav';
import type { SubtitleAppearance } from './lib/subtitle-appearance';
import { CreditsCard, type CreditsCardItem } from './parts/credits-card';
import { SettingsPanel } from './parts/settings-panel';
import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';
import { SkipIntroButton } from './parts/skip-intro-button';
import { Stage } from './parts/stage';
import { StatsPanel } from './parts/stats-panel';
import { TopBar } from './parts/top-bar';
import { Transport } from './parts/transport';
import { PEEK_HEIGHT, type UpNextData, type UpNextItem, UpNextSheet } from './parts/up-next-sheet';
import { deriveChrome, initialSettingsView } from './player-chrome-state';
import { handleCreditsKey, playerInputHandlers } from './player-input';
import { Actions, Media, Panel, PlayerSlotContext, sortSlots } from './player-parts';
import type {
  Chapter,
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
  const slots = useMemo(() => sortSlots(children), [children]);
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

  const panel = useMemo(() => panelGeometry(stageSize.width), [stageSize.width]);

  const { settingsOpen, sheetOpen, settingsShrink, peekVisible, chromeShown } = deriveChrome(
    nav,
    c,
    upNext,
    panel.covers,
  );
  const nativeShrink = settingsOpen && c.surface !== 'video' && !panel.covers;
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
        fill
        z={60}
        bg={c.surface === 'video' ? '#000000' : 'transparent'}
        onLayout={onStageLayout}
        onPointerMove={input.onPointerMove}
      >
        <Ground tone="dark" flex>
          <Stage
            controller={c}
            stageSize={stageSize}
            settingsShrink={settingsShrink}
            nativeShrink={nativeShrink}
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

const s = styles({
  inert: { pointerEvents: 'none' },
  chromeLive: { pointerEvents: 'box-none' },
});

const Player = { Root, Media, Actions, Panel };

export { Player };
