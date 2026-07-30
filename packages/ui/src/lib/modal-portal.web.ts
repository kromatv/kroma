// Repair for react-native-web's <Modal> under React StrictMode.
//
// THE BUG (react-native-web 0.21, ModalPortal): the portal's container div is
// created and appended to `document.body` during RENDER, and removed in an
// effect cleanup. StrictMode runs every mount as mount → cleanup → mount, so the
// cleanup detaches the container and the second mount never rebuilds it - the
// rebuild only happens in render, which does not run again. The modal's children
// keep rendering happily into a node that is no longer in the document, so
// nothing appears, nothing throws, and nothing is logged.
//
// It is dev-only (StrictMode does not double-invoke in production), which is
// exactly why it went unnoticed: the workbench is the one shell with StrictMode
// on, and every <Dialog> in it silently refused to open while the same dialog
// worked in the apps.
//
// THE REPAIR: one extra render once the modal is mounted. ModalPortal rebuilds
// its container on any render that finds the ref empty, which by then it is.
// A modal is a rare, deliberately-mounted thing, so a second render of it costs
// nothing measurable - and this stays correct if the upstream bug is ever fixed,
// because a container that is still attached is left alone.

import { useEffect, useReducer } from 'react';

/**
 * Call from the component that renders the `<Modal>` - the repair is a re-render
 * of the Modal's PARENT, since that is what re-runs ModalPortal's render. Repairs
 * when `mounted` turns true, so a dialog that opens later is fixed on open, not
 * only on first mount.
 */
function useModalPortalRepair(mounted: boolean): void {
  // useReducer, not useState: nothing reads the value, and a discarded state
  // value reads as a mistake. This is a re-render request and says so.
  const [, repair] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (mounted) repair();
  }, [mounted]);
}

export { useModalPortalRepair };
