// <Dialog>: the modal panel (confirmations, PIN entry, track pickers).
//
// Built on React Native's <Modal>, which react-native-web implements too, so one
// component covers all four targets.
//
// On a television it must also TAKE THE REMOTE, and that is not automatic. A
// dialog's buttons used to join the spatial tree of the screen underneath, which
// stayed live: the ring did not move (the screen already had a focus owner, so
// the dialog's `autoFocus` action was read as a late arrival and ignored), the
// D-pad walked straight out of the panel, and OK fired whatever was focused
// BEHIND the dialog - a confirmation whose Enter pressed the button it was
// covering. A webOS magic remote made it worse: in pointer mode the ring follows
// whatever the cursor is over, and opening a dialog does not move the cursor.
//
// So a dialog locks the navigator behind it and mounts its own (see
// lib/focus-scope's <FocusScope> + `useLockFocusBehind`): the buttons in the panel
// become the only things the remote can reach, the ring opens on the default
// action, and the pointer's hold is dropped until it genuinely moves again. Only
// where a navigator is actually running - a phone or the web app has none, and
// there the dialog is exactly what it was.

import { type ReactNode, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, type View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
import { useFocusNav } from '#ui/lib/focus-nav';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusRegion, FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';
import { useModalPortalRepair } from '#ui/lib/modal-portal';
import { useOverlay, useOverlayHost } from '#ui/lib/overlay-host';
import { colors } from '#ui/lib/tokens';

interface DialogProps {
  open: boolean;
  /** Back / Escape / a press on the backdrop. */
  onClose?: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  /** Action row pinned to the bottom of the panel. */
  footer?: ReactNode;
  /** Panel width. Defaults to a comfortable 10-foot reading measure. */
  width?: number;
}

function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 720,
}: Readonly<DialogProps>) {
  // See lib/modal-portal.web: react-native-web's Modal loses its portal
  // container under StrictMode, and a dialog that never appears is the symptom.
  useModalPortalRepair(open);
  // The screen underneath stops answering the remote for as long as this is up.
  // Called HERE rather than in the panel, because the lock has to reach the
  // navigator the dialog was opened FROM - inside the panel it would lock the
  // dialog's own. Inert where no navigator is mounted.
  useLockFocusBehind(open);
  // Is a navigator actually running (the televisions), or is this a pointer app
  // whose dialog needs nothing of the sort?
  const navigated = useInsideFocusScope();
  // `hosted` decides the panel's own remote bridge as well as where it renders:
  // in the host it is inside the app's view hierarchy, where the screen's bridge
  // already reaches it; in a <Modal> it is in a view controller of its own,
  // where that bridge can go quiet. See <FocusScope>'s `bridge`.
  const hosted = useOverlayHost();
  const surface = open ? (
    <DialogSurface
      onClose={onClose}
      width={width}
      title={title}
      description={description}
      trapped={navigated}
      bridge={!hosted}
    >
      {children}
      {footer}
    </DialogSurface>
  ) : null;
  // An app that mounts an <OverlayHost> (the televisions) renders the panel up
  // there instead, and no <Modal> is involved at all. See lib/overlay-host for
  // why a television cannot use one: its own view controller never receives a
  // press, because this app's focus is virtual and the system's focus engine
  // has no reason to move into it.
  useOverlay(surface);
  if (!open || hosted) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      {surface}
    </Modal>
  );
}

/** Split out so `useFocusNav` mounts WITH the panel: that arms the press guard
 * and moves focus into the dialog exactly as a screen transition would. */
function DialogSurface({
  onClose,
  width,
  title,
  description,
  trapped,
  bridge,
  children,
}: Readonly<Omit<DialogProps, 'open'> & { width: number; trapped: boolean; bridge: boolean }>) {
  useFocusNav({ onBack: onClose });
  const backdrop = useRef<View>(null);
  const panel = (
    <Box flex center bg={colors.overlay} p={64}>
      {/* The backdrop closes the dialog, which the props have always promised
          and nothing implemented: without it a pointer user who opens a modal
          has no way out except the keyboard, and because the overlay fills the
          viewport and swallows every click, the whole page behind it goes dead.
          Web only - on a television Back/Menu is the platform's own way out,
          and an extra Pressable there would just be one more thing for the
          D-pad to land on. */}
      {onClose && Platform.OS === 'web' ? (
        <Pressable
          ref={backdrop}
          accessibilityLabel="Close"
          onPress={onClose}
          // The backdrop must never hold the DOM focus. Two reasons it did:
          // react-native-web 0.21's Pressable ignores RN's `focusable` and
          // defaults to `tabindex="0"`, and <Modal>'s focus trap hands the
          // focus to the first node inside it on open - which is this one. A
          // browser then delivers the remote's OK as Enter ON THE FOCUSED
          // ELEMENT, so pressing OK closed the dialog instead of choosing the
          // row the navigator was ringing: every dialog, on every browser TV
          // shell (Tizen, webOS, the desktop shell). `tabIndex` takes it out of
          // the tab order; bouncing the focus covers the programmatic case,
          // and costs nothing because selection here is the navigator's, not
          // the DOM's.
          tabIndex={-1}
          onFocus={() => (backdrop.current as unknown as HTMLElement | null)?.blur()}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Box
        w={width}
        maxW="100%"
        bg="surface2"
        radius="2xl"
        border="borderStrong"
        shadow="pop"
        p={40}
        gap={24}
        dataSet={FOCUS_SCOPE}
      >
        {title ? <Txt variant="h2">{title}</Txt> : null}
        {description ? (
          <Txt color="textMuted" variant="body">
            {description}
          </Txt>
        ) : null}
        {children}
      </Box>
    </Box>
  );
  // The scope contributes no box on the web (see lib/focus-root.web) and a
  // `flex: 1` view on the native targets, which is exactly what the overlay
  // above needs to fill either way.
  return trapped ? (
    <FocusScope style={FILL} bridge={bridge}>
      {panel}
    </FocusScope>
  ) : (
    panel
  );
}

const FILL = { flex: 1 } as const;

/** Marks the panel for the tests and for anyone reading the DOM. The scope above
 * is what actually keeps the remote inside it. */
const FOCUS_SCOPE = { focusScope: '' } as const;

const FOOTER_ROW = {
  flexDirection: 'row' as const,
  justifyContent: 'flex-end' as const,
  gap: 12,
  marginTop: 8,
};

/** The conventional action row: secondary on the left, primary on the right. */
function DialogFooter({ children }: Readonly<{ children: ReactNode }>) {
  return <FocusRegion style={FOOTER_ROW}>{children}</FocusRegion>;
}

interface ConfirmDialogProps extends Omit<DialogProps, 'footer' | 'children'> {
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Paint the confirm action as destructive. */
  destructive?: boolean;
}

/** The common case: a question with a cancel and a confirm. */
function ConfirmDialog({
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  ...dialog
}: Readonly<ConfirmDialogProps>) {
  return (
    <Dialog
      {...dialog}
      footer={
        <DialogFooter>
          <Button variant="ghost" label={cancelLabel} onPress={dialog.onClose} />
          <Button
            variant={destructive ? 'danger' : 'primary'}
            label={confirmLabel}
            onPress={onConfirm}
            autoFocus
          />
        </DialogFooter>
      }
    />
  );
}

export type { ConfirmDialogProps, DialogProps };
export { ConfirmDialog, Dialog, DialogFooter };
