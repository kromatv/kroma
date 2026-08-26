// The right-side settings panel (§5).
//
// Two levels and nothing more: a MENU of every setting, and the ONE sub-view a
// menu row opens. What the menu contains lives in settings/entries, which panel
// each view opens lives in settings/SubView, and the panel itself is what you
// see here - the scrim, the surface, the title line, and where the keys go.
//
// Where the keys go is the only subtle part: the open sub-view owns them
// (`PanelHandle`), the menu owns them otherwise, and in both cases the LIST is
// the single thing that knows where the focus is. Its index -1 is the title
// line's Back button (settings/../lib/panel-header), which is why this file
// keeps no notion of focus of its own - two of those is what once lit a row and
// the Back button at the same time.

import type { ReportCategory } from '@kroma/core';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, type ViewStyle } from 'react-native';
import { useListFocus } from '#ui/components/organisms/player/hooks/use-list-focus';
import { PANEL_MAX, scaler } from '#ui/components/organisms/player/lib/metrics';
import type { ControlId, PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { PanelHeaderProvider } from '#ui/components/organisms/player/lib/panel-header';
import { CARD_MS } from '#ui/components/organisms/player/lib/panel-slide';
import { playerStyle } from '#ui/components/organisms/player/lib/style';
import type { SubtitleAppearance } from '#ui/components/organisms/player/lib/subtitle-appearance';
import { VIRTUAL_FOCUS } from '#ui/components/organisms/player/lib/virtual-focus';
import type { PlayerController } from '#ui/components/organisms/player/types';
import { ease } from '#ui/lib/ease';
import { WEB } from '#ui/lib/platform';
import { useT } from '#ui/services/i18n';
import { menuEntries, movedEntries, panelTitle, type View } from './settings/entries';
import type { SubtitleGenBundle } from './settings/gen';
import { MenuList } from './settings/menu-list';
import { SubView } from './settings/sub-view';
import { TitleBar } from './settings/title-bar';

interface SettingsPanelProps {
  controller: PlayerController;
  /** Controls the transport row had no room for (see ../lib/metrics). The panel
   *  grows a row for each, so a narrow window moves them here instead of losing
   *  them. Empty on any stage wide enough for the whole row. */
  overflow?: readonly ControlId[];
  /** Run one of those controls. The player closes the panel first: pip, cast
   *  and the next episode all change what is on screen behind it. */
  onControl?: (id: ControlId) => void;
  appearance: SubtitleAppearance;
  onAppearanceChange: (p: Partial<SubtitleAppearance>) => void;
  statsOn: boolean;
  onToggleStats: () => void;
  subtitleGen: SubtitleGenBundle;
  /** Report a problem with what is playing. The menu grows the row only when the
   *  host provides this, so a surface with its own reporting flow (or none) is
   *  unaffected. */
  onReport?: (category: ReportCategory) => Promise<void>;
  /** The panel's width in px, from `panelGeometry` - the whole stage once a 44%
   *  panel would be too narrow to read. */
  width?: number;
  /** The panel covers the stage, so there is no scrim left to tap. */
  covers?: boolean;
  /** The chrome's scale (see ../lib/metrics). 1 on a television stage. */
  scale?: number;
  /** Open straight into a sub-view (the Audio / Subtitles cluster quick-access). */
  initialView?: View;
  /** False while the panel is leaving: it stays mounted for the exit, and the
   *  picture expands from under it rather than from under nothing. */
  shown?: boolean;
  onClose: () => void;
}

// Starts off its own edge whatever `shown` says, so a panel mounted open still
// plays its entrance; the player remounts it on each open.
// The browsers have no native driver (react-native-web falls back to a JS
// animation), so there the panel travels on a CSS transition and the movement
// belongs to the compositor rather than to the thread the chrome ticks on.
function webPanelTravel(shown: boolean, width: number): ViewStyle {
  return {
    opacity: shown ? 1 : 0,
    transform: `translateX(${shown ? 0 : width}px)`,
    transitionProperty: 'transform, opacity',
    transitionDuration: `${CARD_MS}ms`,
    transitionTimingFunction: ease.out.css,
    willChange: 'transform',
  } as ViewStyle;
}

function useNativePanelTravel(shown: boolean, width: number) {
  const [slide] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (WEB) return;
    const anim = Animated.timing(slide, {
      toValue: shown ? 0 : 1,
      duration: CARD_MS,
      easing: ease.out.native,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [shown, slide]);
  return {
    opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }],
  };
}

function usePanelTravel(shown: boolean, width: number) {
  const native = useNativePanelTravel(shown, width);
  return WEB ? webPanelTravel(shown, width) : native;
}

export const SettingsPanel = forwardRef<PanelHandle, SettingsPanelProps>(function SettingsPanel(
  {
    controller,
    appearance,
    onAppearanceChange,
    statsOn,
    onToggleStats,
    subtitleGen,
    onReport,
    overflow,
    onControl,
    width,
    covers,
    scale = 1,
    initialView,
    shown = true,
    onClose,
  },
  ref,
) {
  const t = useT();
  const px = scaler(scale);
  const travel = usePanelTravel(shown, width ?? PANEL_MAX);
  const [view, setView] = useState<View>(initialView ?? 'menu');
  // Stable: the imperative handle depends on it, and a fresh arrow per render
  // would rebuild that handle on every keystroke.
  const backToMenu = useCallback(() => setView('menu'), []);

  // Moved controls come FIRST: they are the reason the panel opened on a narrow
  // window, and burying them would make "the cast button disappeared" true.
  const moved = movedEntries(t, overflow ?? [], {
    muted: Boolean(controller.muted),
    onControl,
  });
  const entries = [
    ...moved,
    ...menuEntries(t, controller, {
      statsOn,
      onToggleStats,
      canReport: Boolean(onReport),
      go: setView,
    }),
  ];

  const menuFocus = useListFocus({
    count: entries.length,
    onActivate: (i) => entries[i]?.activate(),
    // Closes the panel directly rather than declining the key and trusting the
    // shell: that fall-through never fired on Apple TV, leaving no way out.
    onBack: onClose,
  });

  // Painted from what the open list reports, never decided here.
  const [backFocused, setBackFocused] = useState(false);
  const header = useMemo(() => ({ activate: backToMenu, report: setBackFocused }), [backToMenu]);

  const subRef = useRef<PanelHandle>(null);
  useImperativeHandle(
    ref,
    () => ({
      onKey: (key) =>
        view === 'menu' ? menuFocus.onKey(key) : (subRef.current?.onKey(key) ?? false),
    }),
    [view, menuFocus.onKey],
  );

  return (
    <>
      {/* Press-to-close scrim (mirrors Back for a pointer, §15). `right` matches
          exactly what the panel leaves behind, not a 56% that only agreed with
          the panel at its design width. */}
      <Pressable
        {...VIRTUAL_FOCUS}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: width ?? '44%',
          zIndex: 41,
          pointerEvents: shown ? 'auto' : 'none',
        }}
      />
      <Animated.ScrollView
        style={[playerStyle.panel, { width: width ?? '44%', maxWidth: PANEL_MAX }, travel]}
        contentContainerStyle={{ paddingHorizontal: px(58), paddingVertical: px(56) }}
        showsVerticalScrollIndicator={false}
      >
        <TitleBar
          title={panelTitle(view, entries, t)}
          back={view === 'menu' ? undefined : backToMenu}
          backFocused={backFocused}
          onClose={covers ? onClose : undefined}
          px={px}
        />

        {view === 'menu' ? (
          <MenuList
            entries={entries}
            moved={moved.length}
            focused={menuFocus.index}
            onFocus={menuFocus.hover}
            px={px}
          />
        ) : (
          <PanelHeaderProvider value={header}>
            <SubView
              ref={subRef}
              view={view}
              controller={controller}
              appearance={appearance}
              onAppearanceChange={onAppearanceChange}
              subtitleGen={subtitleGen}
              onReport={onReport}
              onBack={backToMenu}
            />
          </PanelHeaderProvider>
        )}
      </Animated.ScrollView>
    </>
  );
});
