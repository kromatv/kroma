// <Drawer>: the edge-anchored slide-in sheet (a detail inspector, an edit form,
// the phone nav), on all four targets. The same overlay contract as <Dialog> -
// portalled, scroll-locked, focus-locked behind, Esc/Back and outside-press
// dismiss - but anchored to a side, with its own enter/exit slide. The panel
// stays mounted while `open` is false until the exit has played, so callers
// just flip `open`.

import { Children, isValidElement, type ReactNode, useMemo, useRef } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type View,
  type ViewStyle,
} from 'react-native';
import { Box, Row } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useFocusNav } from '#ui/lib/focus-nav';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';
import { useModalPortalRepair } from '#ui/lib/modal-portal';
import { useOverlay, useOverlayHost } from '#ui/lib/overlay-host';
import { useScrollLock } from '#ui/lib/scroll-lock';
import { useTDefault } from '#ui/services/i18n';
import { Close, Footer, Header, PAD, Panel, type Shell, ShellContext } from './drawer-parts';
import { type DrawerSide, FADE, SlidePanel, useSlide, WEB } from './drawer-slide';

interface DrawerRootProps {
  open: boolean;
  onClose?: () => void;
  /** The sheet's accessible name, and the title of the header the Root draws
   *  when no <Drawer.Header> was composed. */
  title: string;
  side?: DrawerSide;
  width?: number;
  /** Viewport width under which the panel takes the whole screen (the phone
   *  nav sheet). 0 keeps the fixed width everywhere. */
  fullBelow?: number;
  /** Surface overrides (a nav sheet's darker fill), merged over the panel. */
  panelStyle?: ViewStyle;
  /** Horizontal padding shared by the three bands. 0 hands the surface to
   *  content that owns its own layout (a navigation sheet). */
  pad?: number;
  /** The sheet's bands: a `<Drawer.Header>`, a `<Drawer.Panel>` and a
   *  `<Drawer.Footer>`, each optional. Anything else is the panel's content. */
  children?: ReactNode;
}

function Root({
  open,
  onClose,
  title,
  side = 'right',
  width = 460,
  fullBelow = 0,
  panelStyle,
  pad = PAD,
  children,
}: Readonly<DrawerRootProps>) {
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
      pad={pad}
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
  pad,
  shown,
  trapped,
  bridge,
  children,
}: Readonly<
  Omit<DrawerRootProps, 'open'> & {
    side: DrawerSide;
    width: number;
    fullBelow: number;
    pad: number;
    shown: boolean;
    trapped: boolean;
    bridge: boolean;
  }
>) {
  useFocusNav({ onBack: onClose });
  const t = useTDefault();
  const backdrop = useRef<View>(null);
  const window = useWindowDimensions();
  const full = fullBelow > 0 && window.width < fullBelow;
  const shell = useMemo<Shell>(() => ({ pad, onClose }), [pad, onClose]);

  const kids = Children.toArray(children);
  const part = (which: unknown) => kids.find((node) => isValidElement(node) && node.type === which);
  const headerPart = part(Header);
  const panelPart = part(Panel);
  const footerPart = part(Footer);
  const loose = kids.filter(
    (node) => node !== headerPart && node !== panelPart && node !== footerPart,
  );

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
      <SlidePanel shown={shown} side={side} width={full ? window.width : width}>
        <Box
          flex
          w={full ? window.width : width}
          maxW="100%"
          bg="surface1"
          style={[side === 'right' ? s.panelRight : s.panelLeft, panelStyle]}
          role="dialog"
          aria-modal
          accessibilityLabel={title}
          dataSet={FOCUS_SCOPE}
        >
          <ShellContext.Provider value={shell}>
            {headerPart ?? defaultHeader(title)}
            {panelPart ?? <Panel>{loose}</Panel>}
            {footerPart}
          </ShellContext.Provider>
        </Box>
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

function defaultHeader(title: string): ReactNode {
  return (
    <Header>
      <Row between gap={12}>
        <Text variant="h2" accessibilityRole="header">
          {title}
        </Text>
        <Close />
      </Row>
    </Header>
  );
}

const FOCUS_SCOPE = { focusScope: '' } as const;

const s = styles({
  fill: { flex: true },
  scrim: { bg: 'overlay' },
  scrimActive: { pointerEvents: 'auto' },
  scrimInert: { pointerEvents: 'none' },
  panelRight: { borderLeftWidth: 1, borderColor: 'borderStrong', shadow: 'pop', h: '100%' },
  panelLeft: { borderRightWidth: 1, borderColor: 'borderStrong', shadow: 'pop', h: '100%' },
});

/**
 * The edge-anchored sheet. `title` names it to assistive tech and draws the
 * ordinary header; the parts arrange a sheet that needs a header of its own:
 *
 * ```tsx
 * <Drawer.Root open={open} onClose={close} title="Edit registry">…</Drawer.Root>
 *
 * <Drawer.Root open={open} onClose={close} title="Edit registry">
 *   <Drawer.Header>
 *     <Row between>
 *       <Text variant="h2">Edit registry</Text>
 *       <Drawer.Close />
 *     </Row>
 *   </Drawer.Header>
 *   <Drawer.Panel>…</Drawer.Panel>
 *   <Drawer.Footer>…</Drawer.Footer>
 * </Drawer.Root>
 * ```
 *
 * Either way only `Panel` scrolls, through a `ScrollView` that works on a
 * television and a phone as well as in a browser; the header and the footer
 * stay put behind a hairline. `Close` carries the Root's `onClose`, so a header
 * of your own keeps the way out the default one draws. A part is found
 * only as a DIRECT child of the Root, so a header built by a component of your
 * own is wrapped at the call site rather than returning `<Drawer.Header>`
 * itself.
 */
const Drawer = { Root, Header, Panel, Footer, Close };

export type { DrawerRootProps, DrawerSide };
export { Drawer };
