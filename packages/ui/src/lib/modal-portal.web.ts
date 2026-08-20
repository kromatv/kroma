// Repair for react-native-web 0.21's ModalPortal under React StrictMode: the
// container div is appended to `document.body` during RENDER and removed in an
// effect cleanup, so StrictMode's mount -> cleanup -> mount leaves the modal
// rendering into a detached node, silently. One extra render after mount makes
// ModalPortal rebuild the container, and is a no-op once upstream is fixed.

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
