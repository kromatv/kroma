// What a layer portalled to the document has to clear to be usable inside a
// dialog. react-native-web's <Modal> pins its own layer at 9999, and a popup
// that left for the document root is its sibling rather than its child, so
// anything below that draws under the scrim and cannot be clicked.

const MODAL_LAYER = 9999;

export const OVERLAY_Z = {
  backdrop: MODAL_LAYER + 1,
  panel: MODAL_LAYER + 2,
  tooltip: MODAL_LAYER + 3,
} as const;
