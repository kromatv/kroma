// <Dialog>: the modal panel (confirmations, PIN entry, track pickers).
//
// Built on React Native's <Modal>, which react-native-web implements too, so one
// component covers all four targets. On Apple TV the modal is presented as its
// own view controller and the OS focus engine is naturally confined to it; on the
// web the panel declares a focus SCOPE (`data-focus-scope`) that the spatial
// navigator honours, so the D-pad cannot wander back into the page behind.

import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
import { useFocusNav } from '#ui/lib/focus-nav';
import { FocusRegion } from '#ui/lib/focus-scope';
import { useModalPortalRepair } from '#ui/lib/modal-portal';
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
  if (!open) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <DialogSurface onClose={onClose} width={width} title={title} description={description}>
        {children}
        {footer}
      </DialogSurface>
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
  children,
}: Readonly<Omit<DialogProps, 'open'> & { width: number }>) {
  useFocusNav({ onBack: onClose });
  return (
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
          accessibilityLabel="Close"
          onPress={onClose}
          focusable={false}
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
}

/** Marks the subtree the web spatial navigator must stay inside. Ignored by the
 * native targets, whose OS focus engine already confines focus to the modal. */
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
