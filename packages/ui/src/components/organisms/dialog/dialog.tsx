// The modal panel (confirmations, PIN entry, track pickers), on all four targets.
// On a TV it locks the navigator behind it and mounts its own, so the remote
// cannot reach (or fire OK on) anything under the panel.

import { type ReactNode, useId, useMemo } from 'react';
import { Modal, Platform, useWindowDimensions } from 'react-native';
import { Box } from '#ui/components/atoms/box';
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
import { Actions } from './dialog-actions';
import { Footer, Header, Panel, type Shell, ShellContext } from './dialog-parts';

interface DialogRootProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  /** The panel's bands: a `<Dialog.Header>`, a `<Dialog.Panel>` and a
   *  `<Dialog.Footer>`, each optional. Anything else is the panel's content. */
  children?: ReactNode;
  width?: number;
  /** Panel padding. 0 hands the surface to content that owns its own layout
   *  (a routed detail sheet); such a dialog names itself via `title` even
   *  though nothing visible renders it. */
  pad?: number;
  /** Keep `title` as the accessible name only; the visible header is the
   *  content's own. */
  titleHidden?: boolean;
}

function Root({
  open,
  onClose,
  title,
  description,
  children,
  width = 720,
  pad = 40,
  titleHidden = false,
}: Readonly<DialogRootProps>) {
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
  Omit<DialogRootProps, 'open'> & { width: number; pad: number; trapped: boolean; bridge: boolean }
>) {
  useFocusNav({ onBack: onClose });
  // A 64pt gutter is a frame on a television and a squeeze on a phone, where it
  // costs a third of the width the panel has to say anything in.
  const gutter = useWindowDimensions().width < 600 ? 16 : 64;
  const titleId = useId();
  const descriptionId = useId();
  const showsTitle = Boolean(title) && !titleHidden;
  const {
    header: headerPart,
    panel: panelPart,
    footer: footerPart,
    loose,
  } = surfaceBands(children, { header: Header, panel: Panel, footer: Footer });
  const header =
    headerPart ?? defaultHeader({ showsTitle, title, description, titleId, descriptionId });
  const hasHeader = Boolean(header);
  const hasFooter = Boolean(footerPart);
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
      <DismissBackdrop onPress={onClose} />
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
          {panelPart ?? <Panel>{loose}</Panel>}
          {footerPart}
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
        <Text nativeID={at.titleId} variant="h2">
          {at.title}
        </Text>
      ) : null}
      {at.description ? (
        <Text nativeID={at.descriptionId} color="textMuted" variant="body">
          {at.description}
        </Text>
      ) : null}
    </Header>
  );
}

const FOCUS_SCOPE = { focusScope: '' } as const;

const s = styles({
  fill: { flex: true },
});

/**
 * The modal panel. The Root takes `title` / `description`, which name it to
 * assistive tech and draw the ordinary header; the parts arrange a panel that
 * needs a header of its own, or a footer:
 *
 * ```tsx
 * <Dialog.Root open onClose={close} title="Supprimer">
 *   <Text>…</Text>
 *   <Dialog.Footer><Dialog.Actions … /></Dialog.Footer>
 * </Dialog.Root>
 *
 * <Dialog.Root open onClose={close}>
 *   <Dialog.Header>…</Dialog.Header>
 *   <Dialog.Panel>…</Dialog.Panel>
 *   <Dialog.Footer><Dialog.Actions … /></Dialog.Footer>
 * </Dialog.Root>
 * ```
 *
 * Either way only `Panel` scrolls; the header and the footer stay put.
 * `Footer` is the pinned shelf and `Actions` is the row of controls, so the two
 * nest rather than compete.
 */
const Dialog = { Root, Header, Panel, Footer, Actions };

export type { DialogRootProps };
export { Dialog };
