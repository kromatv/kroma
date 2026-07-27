// Repair for react-native-web's <Modal> under React StrictMode. Native no-op.
//
// React Native's own Modal presents a real platform view and has none of the
// problem described in the `.web` half, so a television pays nothing for this.

/** No-op off the web. See `modal-portal.web.ts` for what this repairs. */
function useModalPortalRepair(_mounted: boolean): void {
  // Nothing to repair: the native Modal is a platform view, not a DOM portal.
}

export { useModalPortalRepair };
