// The modal panel (confirmations, PIN entry, track pickers), on all four targets.
// On a TV it locks the navigator behind it and mounts its own, so the remote
// cannot reach — or fire OK on — anything under the panel.

import { type ReactNode, useId, useRef } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, type View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useFocusNav } from '#ui/lib/focus-nav';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusRegion, FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';
import { useModalPortalRepair } from '#ui/lib/modal-portal';
import { useOverlay, useOverlayHost } from '#ui/lib/overlay-host';
import { useScrollLock } from '#ui/lib/scroll-lock';
import { useTDefault } from '#ui/services/i18n';

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
  pad,
  title,
  titleHidden,
  description,
  trapped,
  bridge,
  children,
}: Readonly<
  Omit<DialogProps, 'open'> & { width: number; pad: number; trapped: boolean; bridge: boolean }
>) {
  useFocusNav({ onBack: onClose });
  const t = useTDefault();
  const backdrop = useRef<View>(null);
  const titleId = useId();
  const descriptionId = useId();
  const showsTitle = Boolean(title) && !titleHidden;
  // The panel names itself: by reference on the web when the title is visible
  // (so a screen reader can also jump to it), by value otherwise.
  const naming =
    Platform.OS === 'web'
      ? {
          'aria-labelledby': showsTitle ? titleId : undefined,
          'aria-label': showsTitle ? undefined : title,
          'aria-describedby': description ? descriptionId : undefined,
        }
      : { accessibilityLabel: title };
  const panel = (
    <Box flex center bg="overlay" p={64}>
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
        {/* The panel scrolls as a whole (the old admin modal's contract): with
            the page scroll locked behind the overlay, a form taller than the
            viewport would otherwise clip with its actions unreachable. */}
        <ScrollView contentContainerStyle={{ padding: pad, gap: pad > 0 ? 24 : 0 }}>
          {showsTitle ? (
            <Txt nativeID={titleId} variant="h2">
              {title}
            </Txt>
          ) : null}
          {description ? (
            <Txt nativeID={descriptionId} color="textMuted" variant="body">
              {description}
            </Txt>
          ) : null}
          {children}
        </ScrollView>
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
  actionsSplit: { row: true, align: 'center', justify: 'space-between', gap: 12, mt: 8 },
  actionsEnd: { row: true, align: 'center', gap: 10 },
});

function DialogFooter({ children }: Readonly<{ children: ReactNode }>) {
  return <FocusRegion style={s.footerRow}>{children}</FocusRegion>;
}

interface DialogActionsProps {
  onCancel: () => void;
  cancelLabel: string;
  onConfirm: () => void;
  /** Already resolved by the caller, so it can swap to "Saving...". */
  confirmLabel: string;
  /** The confirm spins and both actions ignore presses while the work runs. */
  busy?: boolean;
  disabled?: boolean;
  /** A destructive third action pinned to the far edge ("Delete account"). */
  destructive?: { label: string; onPress: () => void; disabled?: boolean };
}

/** The standard dialog footer: a right-aligned cancel + primary pair, with an
 *  optional destructive action pinned left. */
function DialogActions({
  onCancel,
  cancelLabel,
  onConfirm,
  confirmLabel,
  busy = false,
  disabled = false,
  destructive,
}: Readonly<DialogActionsProps>) {
  return (
    <FocusRegion style={destructive ? s.actionsSplit : s.footerRow}>
      {destructive ? (
        <Button
          variant="dangerGhost"
          size="sm"
          label={destructive.label}
          onPress={destructive.onPress}
          disabled={busy || destructive.disabled}
        />
      ) : null}
      <Box row align="center" gap={10} style={destructive ? undefined : s.actionsEnd}>
        <Button variant="ghost" size="sm" label={cancelLabel} onPress={onCancel} disabled={busy} />
        <Button
          variant="primary"
          size="sm"
          label={confirmLabel}
          onPress={onConfirm}
          loading={busy}
          disabled={disabled}
        />
      </Box>
    </FocusRegion>
  );
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

export type { ConfirmDialogProps, DialogActionsProps, DialogProps };
export { ConfirmDialog, Dialog, DialogActions, DialogFooter };
