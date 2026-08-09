// <Drawer>: the edge-anchored slide-in panel (a detail inspector, an edit
// form, the phone nav), on all four targets. The same overlay contract as
// <Dialog> - portalled, scroll-locked, focus-locked behind, Esc/Back and
// outside-press dismiss - but anchored to a side, with its own enter/exit
// slide. The panel stays mounted while `open` is false until the exit has
// played, so callers just flip `open`.

import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type View,
  type ViewStyle,
} from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import { motion } from '#ui/core/tokens';
import { ease } from '#ui/lib/ease';
import { useFocusNav } from '#ui/lib/focus-nav';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';
import { useModalPortalRepair } from '#ui/lib/modal-portal';
import { useOverlay, useOverlayHost } from '#ui/lib/overlay-host';
import { useScrollLock } from '#ui/lib/scroll-lock';
import { useTDefault } from '#ui/services/i18n';

const WEB = Platform.OS === 'web';
const SLIDE_MS = motion.duration.slow;

type DrawerSide = 'left' | 'right';

interface DrawerProps {
  open: boolean;
  onClose?: () => void;
  /** Accessible name only: the visible header is the caller's. */
  title: string;
  side?: DrawerSide;
  width?: number;
  /** Viewport width under which the panel takes the whole screen (the phone
   *  nav sheet). 0 keeps the fixed width everywhere. */
  fullBelow?: number;
  /** Surface overrides (a nav sheet's darker fill), merged over the panel. */
  panelStyle?: ViewStyle;
  children?: ReactNode;
}

/** Where the slide is between mounted and shown: `mounted` keeps the panel in
 *  the tree for the exit, `shown` drives the transform, one frame late on enter
 *  so the transition has an off-screen start to play from. */
function useSlide(open: boolean): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const out = setTimeout(() => setMounted(false), SLIDE_MS);
    return () => clearTimeout(out);
  }, [open]);
  return { mounted, shown };
}

function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  width = 460,
  fullBelow = 0,
  panelStyle,
  children,
}: Readonly<DrawerProps>) {
  const { mounted, shown } = useSlide(open);
  useModalPortalRepair(mounted);
  useScrollLock(mounted);
  // The lock has to reach the navigator the drawer was opened FROM, so it is
  // called here rather than in the surface.
  useLockFocusBehind(open);
  const navigated = useInsideFocusScope();
  const hosted = useOverlayHost();
  const surface = mounted ? (
    <DrawerSurface
      onClose={onClose}
      title={title}
      side={side}
      width={width}
      fullBelow={fullBelow}
      panelStyle={panelStyle}
      shown={shown}
      trapped={navigated}
      bridge={!hosted}
    >
      {children}
    </DrawerSurface>
  ) : null;
  useOverlay(surface);
  if (!mounted || hosted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {surface}
    </Modal>
  );
}

// Split out so `useFocusNav` mounts WITH the panel, arming the press guard and
// moving focus in exactly as a screen transition would (see <Dialog>).
function DrawerSurface({
  onClose,
  title,
  side,
  width,
  fullBelow,
  panelStyle,
  shown,
  trapped,
  bridge,
  children,
}: Readonly<{
  onClose?: () => void;
  title: string;
  side: DrawerSide;
  width: number;
  fullBelow: number;
  panelStyle?: ViewStyle;
  shown: boolean;
  trapped: boolean;
  bridge: boolean;
  children: ReactNode;
}>) {
  useFocusNav({ onBack: onClose });
  const t = useTDefault();
  const backdrop = useRef<View>(null);
  const window = useWindowDimensions();
  const full = fullBelow > 0 && window.width < fullBelow;
  const panel = (
    <Box flex style={s.fill}>
      <Box
        style={[
          StyleSheet.absoluteFill,
          s.scrim,
          WEB ? (FADE as ViewStyle) : null,
          shown ? s.scrimActive : s.scrimInert,
        ]}
        opacity={shown ? 1 : 0}
      >
        {/* Web only: on a TV, Back/Menu is the platform's way out and an extra
            Pressable is one more thing for the D-pad to land on. */}
        {onClose && WEB ? (
          <Pressable
            ref={backdrop}
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            // Never the DOM focus owner: see the same guard in <Dialog>.
            tabIndex={-1}
            onFocus={() => (backdrop.current as unknown as HTMLElement | null)?.blur()}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </Box>
      <SlidePanel
        shown={shown}
        side={side}
        width={full ? window.width : width}
        title={title}
        panelStyle={panelStyle}
      >
        {children}
      </SlidePanel>
    </Box>
  );
  return trapped ? (
    <FocusScope style={s.fill} bridge={bridge}>
      {panel}
    </FocusScope>
  ) : (
    panel
  );
}

function SlidePanel({
  shown,
  side,
  width,
  title,
  panelStyle,
  children,
}: Readonly<{
  shown: boolean;
  side: DrawerSide;
  width: number;
  title: string;
  panelStyle?: ViewStyle;
  children: ReactNode;
}>) {
  const holder = side === 'right' ? s.holderRight : s.holderLeft;
  const body = (
    <Box
      flex
      w={width}
      maxW="100%"
      bg="surface1"
      style={[side === 'right' ? s.panelRight : s.panelLeft, panelStyle]}
      role="dialog"
      aria-modal
      accessibilityLabel={title}
      dataSet={FOCUS_SCOPE}
    >
      {children}
    </Box>
  );
  if (WEB) {
    const away = side === 'right' ? SLIDE_OUT : SLIDE_OUT_LEFT;
    return (
      <Box style={[holder, SLIDE as ViewStyle, { transform: [{ translateX: shown ? 0 : away }] }]}>
        {body}
      </Box>
    );
  }
  return (
    <SlidePanelNative shown={shown} side={side} width={width} holder={holder}>
      {body}
    </SlidePanelNative>
  );
}

function SlidePanelNative({
  shown,
  side,
  width,
  holder,
  children,
}: Readonly<{
  shown: boolean;
  side: DrawerSide;
  width: number;
  holder: ViewStyle;
  children: ReactNode;
}>) {
  // Initial value matches the initial state so a drawer restored open does not
  // play its own entrance.
  const slide = useRef(new Animated.Value(shown ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: shown ? 0 : 1,
      duration: SLIDE_MS,
      easing: ease.out.native,
      useNativeDriver: true,
    }).start();
  }, [shown, slide]);
  const off = width * 1.05 * (side === 'right' ? 1 : -1);
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [0, off] });
  return (
    <Animated.View style={[holder, { transform: [{ translateX }] }]}>{children}</Animated.View>
  );
}

const FOCUS_SCOPE = { focusScope: '' } as const;

// Past its own edge plus the shadow's reach, so nothing peeks while closed.
const SLIDE_OUT = '105%' as unknown as number;
const SLIDE_OUT_LEFT = '-105%' as unknown as number;

// react-native-web understands these CSS-only props; React Native's types do
// not, hence the casts at the use sites.
const SLIDE = {
  transitionProperty: 'transform',
  transitionDuration: `${SLIDE_MS}ms`,
  transitionTimingFunction: ease.out.css,
};
const FADE = {
  transitionProperty: 'opacity',
  transitionDuration: `${SLIDE_MS}ms`,
  transitionTimingFunction: ease.out.css,
};

const s = styles({
  fill: { flex: true },
  scrim: { bg: 'overlay' },
  scrimActive: { pointerEvents: 'auto' },
  scrimInert: { pointerEvents: 'none' },
  holderRight: { absolute: true, top: 0, bottom: 0, right: 0, maxW: '100%' },
  holderLeft: { absolute: true, top: 0, bottom: 0, left: 0, maxW: '100%' },
  panelRight: { borderLeftWidth: 1, borderColor: 'borderStrong', shadow: 'pop', h: '100%' },
  panelLeft: { borderRightWidth: 1, borderColor: 'borderStrong', shadow: 'pop', h: '100%' },
});

export type { DrawerProps, DrawerSide };
export { Drawer };
