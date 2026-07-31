// The modal panel (confirmations, PIN entry, track pickers), on all four targets.
// On a TV it locks the navigator behind it and mounts its own, so the remote
// cannot reach — or fire OK on — anything under the panel.

import { type ReactNode, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, type View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useFocusNav } from '#ui/lib/focus-nav';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusRegion, FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';
import { useModalPortalRepair } from '#ui/lib/modal-portal';
import { useOverlay, useOverlayHost } from '#ui/lib/overlay-host';

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
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
  // react-native-web's Modal loses its portal container under StrictMode, and a
  // dialog that never appears is the symptom. See lib/modal-portal.web.
  useModalPortalRepair(open);
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
      title={title}
      description={description}
      trapped={navigated}
      bridge={!hosted}
    >
      {children}
      {footer}
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
  title,
  description,
  trapped,
  bridge,
  children,
}: Readonly<Omit<DialogProps, 'open'> & { width: number; trapped: boolean; bridge: boolean }>) {
  useFocusNav({ onBack: onClose });
  const backdrop = useRef<View>(null);
  const panel = (
    <Box flex center bg="overlay" p={64}>
      {/* Web only: on a TV, Back/Menu is the platform's way out and an extra
          Pressable is one more thing for the D-pad to land on. */}
      {onClose && Platform.OS === 'web' ? (
        <Pressable
          ref={backdrop}
          accessibilityLabel="Close"
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
  return trapped ? (
    <FocusScope style={s.fill} bridge={bridge}>
      {panel}
    </FocusScope>
  ) : (
    panel
  );
}

const FOCUS_SCOPE = { focusScope: '' } as const;

const s = styles({
  fill: { flex: true },
  footerRow: { row: true, justify: 'flex-end', gap: 12, mt: 8 },
});

function DialogFooter({ children }: Readonly<{ children: ReactNode }>) {
  return <FocusRegion style={s.footerRow}>{children}</FocusRegion>;
}

interface ConfirmDialogProps extends Omit<DialogProps, 'footer' | 'children'> {
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}

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
