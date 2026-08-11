// The modal panel (confirmations, PIN entry, track pickers), on all four targets.
// On a TV it locks the navigator behind it and mounts its own, so the remote
// cannot reach — or fire OK on — anything under the panel.

import { Children, isValidElement, type ReactNode, useId, useMemo, useRef } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type View,
} from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useFocusNav } from '#ui/lib/focus-nav';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';
import { useModalPortalRepair } from '#ui/lib/modal-portal';
import { useOverlay, useOverlayHost } from '#ui/lib/overlay-host';
import { useScrollLock } from '#ui/lib/scroll-lock';
import { useTDefault } from '#ui/services/i18n';
import { Content, Footer, FooterSlot, Header, type Shell, ShellContext } from './dialog-parts';

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Panel padding. 0 hands the surface to content that owns its own layout
   *  (a routed detail sheet); such a dialog names itself via `title` even
   *  though nothing visible renders it. */
  pad?: number;
  /** Keep `title` as the accessible name only; the visible header is the
   *  content's own. */
  titleHidden?: boolean;
}

function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 720,
  pad = 40,
  titleHidden = false,
}: Readonly<DialogProps>) {
  // react-native-web's Modal loses its portal container under StrictMode, and a
  // dialog that never appears is the symptom. See lib/modal-portal.web.
  useModalPortalRepair(open);
  useScrollLock(open);
  // Called here, not in the panel: the lock has to reach the navigator the
  // dialog was opened FROM.
  useLockFocusBehind(open);
  const navigated = useInsideFocusScope();
  // A <Modal> renders in a view controller of its own, where the screen's remote
  // bridge can go quiet; inside the overlay host it does not. See <FocusScope>.
  const hosted = useOverlayHost();
  const surface = open ? (
    <DialogSurface
      onClose={onClose}
      width={width}
      pad={pad}
      titleHidden={titleHidden}
      title={title}
      description={description}
      footer={footer}
      trapped={navigated}
      bridge={!hosted}
    >
      {children}
    </DialogSurface>
  ) : null;
  // A TV mounts an <OverlayHost> and renders the panel there: a <Modal>'s view
  // controller never receives a press, because this app's focus is virtual and
  // the system focus engine has no reason to move into it.
  useOverlay(surface);
  if (!open || hosted) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      {surface}
    </Modal>
  );
}

// Split out so `useFocusNav` mounts WITH the panel: that arms the press guard
// and moves focus into the dialog exactly as a screen transition would.
function DialogSurface({
  onClose,
  width,
  pad,
  title,
  titleHidden,
  description,
  footer,
  trapped,
  bridge,
  children,
}: Readonly<
  Omit<DialogProps, 'open'> & { width: number; pad: number; trapped: boolean; bridge: boolean }
>) {
  useFocusNav({ onBack: onClose });
  const t = useTDefault();
  // A 64pt gutter is a frame on a television and a squeeze on a phone, where it
  // costs a third of the width the panel has to say anything in.
  const gutter = useWindowDimensions().width < 600 ? 16 : 64;
  const backdrop = useRef<View>(null);
  const titleId = useId();
  const descriptionId = useId();
  const showsTitle = Boolean(title) && !titleHidden;
  const kids = Children.toArray(children);
  const part = (which: unknown) => kids.find((node) => isValidElement(node) && node.type === which);
  const headerPart = part(Header);
  const contentPart = part(Content);
  const footerPart = part(Footer);
  const loose = kids.filter(
    (node) => node !== headerPart && node !== contentPart && node !== footerPart,
  );
  const header =
    headerPart ?? defaultHeader({ showsTitle, title, description, titleId, descriptionId });
  const foot = footerPart ?? (footer ? <FooterSlot>{footer}</FooterSlot> : null);
  const hasHeader = Boolean(header);
  const hasFooter = Boolean(foot);
  const shell = useMemo<Shell>(() => ({ pad, hasHeader, hasFooter }), [pad, hasHeader, hasFooter]);
  // By reference only when this panel rendered the node carrying the id: a
  // composed <Dialog.Header> replaces the fallback, and those ids go with it.
  const namesOwnTitle = !headerPart && showsTitle;
  const naming =
    Platform.OS === 'web'
      ? {
          'aria-labelledby': namesOwnTitle ? titleId : undefined,
          'aria-label': namesOwnTitle ? undefined : title,
          'aria-describedby': !headerPart && description ? descriptionId : undefined,
        }
      : { accessibilityLabel: title };
  const panel = (
    <Box flex center bg="overlay" p={gutter}>
      {/* Web only: on a TV, Back/Menu is the platform's way out and an extra
          Pressable is one more thing for the D-pad to land on. */}
      {onClose && Platform.OS === 'web' ? (
        <Pressable
          ref={backdrop}
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          // The backdrop must never hold the DOM focus: react-native-web 0.21's
          // Pressable ignores `focusable` and defaults to `tabindex="0"`, and
          // <Modal>'s focus trap focuses the first node inside it on open. A
          // browser TV shell then delivers the remote's OK as Enter on that
          // element, closing the dialog instead of choosing the ringed row.
          tabIndex={-1}
          onFocus={() => (backdrop.current as unknown as HTMLElement | null)?.blur()}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Box
        w={width}
        maxW="100%"
        maxH="100%"
        bg="surface2"
        radius="2xl"
        border="borderStrong"
        shadow="pop"
        overflow="hidden"
        dataSet={FOCUS_SCOPE}
        role="dialog"
        aria-modal
        {...naming}
      >
        <ShellContext.Provider value={shell}>
          {header}
          {contentPart ?? <Content>{loose}</Content>}
          {foot}
        </ShellContext.Provider>
      </Box>
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

function defaultHeader(at: {
  showsTitle: boolean;
  title: string | undefined;
  description: string | undefined;
  titleId: string;
  descriptionId: string;
}): ReactNode {
  if (!at.showsTitle && !at.description) return null;
  return (
    <Header>
      {at.showsTitle ? (
        <Txt nativeID={at.titleId} variant="h2">
          {at.title}
        </Txt>
      ) : null}
      {at.description ? (
        <Txt nativeID={at.descriptionId} color="textMuted" variant="body">
          {at.description}
        </Txt>
      ) : null}
    </Header>
  );
}

const FOCUS_SCOPE = { focusScope: '' } as const;

const s = styles({
  fill: { flex: true },
});

/**
 * The modal panel. Callable with `title` / `description` / `footer` for the
 * ordinary case, and composed through its parts when a panel needs its own
 * header or a footer that is not a row of buttons:
 *
 *   <Dialog open onClose={close}>
 *     <Dialog.Header>…</Dialog.Header>
 *     <Dialog.Content>…</Dialog.Content>
 *     <Dialog.Footer>…</Dialog.Footer>
 *   </Dialog>
 *
 * Either way only `Content` scrolls; the header and the footer stay put.
 */
const DialogParts = Object.assign(Dialog, {
  Root: Dialog,
  Header,
  Content,
  Footer,
});

export type { DialogProps };
export { DialogParts as Dialog };
