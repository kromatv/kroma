import { useHeldSeek } from '@kromatv/core/react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Dimensions, type LayoutChangeEvent } from 'react-native';

import { usePlayerKeys } from '#ui/lib/player/use-player-keys';
import { volumeStep } from '../lib/fmt';
import { chromeMetrics, panelGeometry, scaler, TRANSPORT_HEIGHT } from '../lib/metrics';
import { type ControlId, controlOrder, type PanelHandle } from '../lib/nav';
import { usePanelSlide } from '../lib/panel-slide';
import { DEFAULT_SUB_APPEARANCE } from '../lib/subtitle-appearance';
import { PEEK_HEIGHT, type UpNextData, type UpNextItem } from '../parts/up-next-sheet';
import type { SubtitleGenBundle } from '../parts/settings-panel/settings/gen';
import type { StageFlash } from '../parts/stage-flash';
import { deriveChrome, hasUpNext, initialSettingsView } from '../player-chrome-state';
import { playerInputHandlers } from '../player-input';
import { sortSlots } from '../player-parts';
import type {
  PlayerCloseReason,
  PlayerController,
  PlayerFlags,
  PlayerCloseDetails,
} from '../types';
import { useIdleCursor } from './use-idle-cursor';
import { usePlayerEnding } from './use-player-ending';
import { usePlayerNav } from './use-player-nav';
import { useResumeCard } from './use-resume-card';
import { useResumeNotice } from './use-resume-notice';
import { useSeekNudge } from './use-seek-nudge';
import { useVolumeFlash } from './use-volume-flash';

interface UsePlayerRootArgs {
  controller: PlayerController;
  flags: PlayerFlags;
  active?: boolean;
  onCast?: () => void;
  onClose: (details: PlayerCloseDetails) => void;
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

function usePlayerRoot({
  controller,
  flags,
  active,
  onCast,
  onClose,
  children,
}: Readonly<UsePlayerRootArgs>) {
  const c = useHeldSeek(controller);
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
  const notice = useResumeNotice({
    at: slots.resume?.at,
    cur: c.cur,
    playing: c.playing,
    waiting: c.waiting,
  });
  const startOver = () => {
    notice.dismiss();
    c.seekTo(0);
  };
  const resumeCard = useResumeCard(notice, startOver);
  // The skip pill waits: it is the same corner as the resume prompt, and OK
  // belongs to whichever of the two is drawn.
  const intro = useMemo(
    () =>
      onSkipIntro
        ? { active: introActive === true && !notice.shown, onSkip: onSkipIntro }
        : undefined,
    [introActive, onSkipIntro, notice.shown],
  );

  // Measured BEFORE the nav machine, which is then given the row that is drawn:
  // a shed control must not keep a focus stop.
  const row = useMemo(() => controlOrder(flags, Boolean(onPlayNext)), [flags, onPlayNext]);
  const metrics = useMemo(() => chromeMetrics(row, stageSize.width), [row, stageSize.width]);
  const px = scaler(metrics.scale);

  const seek = useSeekNudge(c);
  const volumeFlash = useVolumeFlash();
  const volumeMax = c.volumeMax ?? 1;
  const setVolume = (level: number) => {
    c.setVolume(level);
    volumeFlash.show(level);
  };
  const flash: StageFlash | null = seek.burst ? { kind: 'seek', ...seek.burst } : volumeFlash.flash;
  const nav = usePlayerNav(
    c.playing,
    {
      togglePlay: c.togglePlay,
      seekNudge: seek.nudge,
      onNext: () => onPlayNext?.(),
      hasNext: Boolean(onPlayNext),
      sheetHasItems: hasUpNext(upNext),
      volumeNudge: (d) => setVolume(volumeStep(c.volume, d, volumeMax)),
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
    active,
    nav,
    controller: c,
    flags,
    panelRef,
    locked,
    seekNudge: seek.nudge,
    setVolume,
    intro,
    resume: { active: notice.shown, onKey: resumeCard.onKey },
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

  const { openOverlay } = nav;
  const openSheet = useCallback(() => openOverlay('sheet'), [openOverlay]);
  // Close first: pip, cast and the next episode all change what is on screen, and
  // leaving the panel over it would hide the thing just asked for.
  const runOverflow = (id: ControlId) => {
    nav.closeOverlay();
    nav.activate(id);
  };
  const playUpNextItem = useCallback((item: UpNextItem) => onPlayItem?.(item), [onPlayItem]);

  return {
    c,
    slots,
    upNext,
    nextTitle,
    onPlayNext,
    postPlay,
    appearance,
    onAppearanceChange,
    subtitleGen,
    onReport,
    rawChapters,
    tileAt,
    stageSize,
    onStageLayout,
    statsOn,
    setStatsOn,
    panelRef,
    locked,
    closeFromChrome,
    notice,
    startOver,
    resumeCard,
    intro,
    metrics,
    flash,
    nav,
    credits,
    ending,
    input,
    settingsShrink,
    settings,
    initialView,
    panel,
    onTransportLayout,
    bottomInset,
    introLift,
    sheetOpen,
    peekVisible,
    chromeShown,
    openSheet,
    runOverflow,
    playUpNextItem,
  };
}

export { usePlayerRoot };
