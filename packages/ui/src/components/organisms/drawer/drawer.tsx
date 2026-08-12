// <Drawer>: the edge-anchored slide-in sheet (a detail inspector, an edit form,
// the phone nav), on all four targets. The same overlay contract as <Dialog> -
// portalled, scroll-locked, focus-locked behind, Esc/Back and outside-press
// dismiss - but anchored to a side, with its own enter/exit slide. The panel
// stays mounted while `open` is false until the exit has played, so callers
// just flip `open`.

import { type ReactNode, useMemo } from 'react';
import { Modal, StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';
import { Box, Row } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { DismissBackdrop } from '#ui/lib/dismiss-backdrop';
import { useFocusNav } from '#ui/lib/focus-nav';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';
import { useModalPortalRepair } from '#ui/lib/modal-portal';
import { useOverlay, useOverlayHost } from '#ui/lib/overlay-host';
import { useScrollLock } from '#ui/lib/scroll-lock';
import { surfaceBands } from '#ui/lib/surface-bands';
import { SURFACE_WIDTH, type SurfaceWidth } from '#ui/lib/surface-shell';
import { Close, Footer, Header, PAD, Panel, type Shell, ShellContext } from './drawer-parts';
import { type DrawerSide, FADE, SlidePanel, useSlide, WEB } from './drawer-slide';

interface DrawerRootProps {
  open: boolean;
  onClose?: () => void;
  /** The sheet's accessible name, and the title of the header the Root draws
   *  when no <Drawer.Header> was composed. */
  title: string;
  side?: DrawerSide;
  /** The sheet's step on the kit's width ladder, named for the densest thing it
   *  holds rather than measured in pixels. See {@link SURFACE_WIDTH}. */
  width?: SurfaceWidth;
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
  width = 'md',
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
    width: SurfaceWidth;
    fullBelow: number;
    pad: number;
    shown: boolean;
    trapped: boolean;
    bridge: boolean;
  }
>) {
  useFocusNav({ onBack: onClose });
  const window = useWindowDimensions();
  const full = fullBelow > 0 && window.width < fullBelow;
  const panelWidth = full ? window.width : SURFACE_WIDTH[width];
  const shell = useMemo<Shell>(() => ({ pad, onClose }), [pad, onClose]);

  const {
    header: headerPart,
    panel: panelPart,
    footer: footerPart,
    loose,
  } = surfaceBands(children, { header: Header, panel: Panel, footer: Footer });

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
        <DismissBackdrop onPress={onClose} />
      </Box>
      <SlidePanel shown={shown} side={side} width={panelWidth}>
        <Box
          flex
          w={panelWidth}
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
