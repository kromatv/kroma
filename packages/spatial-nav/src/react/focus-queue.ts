import type { SpatialNavigator } from '@kroma/spatial-nav';

interface FocusQueue {
  request: (id: string) => void;
  claim: (id: string) => void;
  flush: () => void;
}

/**
 * Focus asked for before the tree it names is whole. A node registers in its
 * mount effect and its parent registers after it, so focus asked for on mount
 * names a node the navigator cannot reach yet. The request is KEPT until it
 * lands: the root retries it on every registration, which is the only moment
 * the tree can have become whole, and after its own renders.
 */
function focusQueue(navigator: SpatialNavigator): FocusQueue {
  let pending: string | null = null;
  let requested = false;

  return {
    request(id) {
      if (navigator.focus(id)) return;
      pending = id;
      requested = true;
    },
    claim(id) {
      if (navigator.focusedId || pending) return;
      if (navigator.focus(id)) return;
      pending = id;
    },
    flush() {
      if (pending === null) return;
      if (!requested && navigator.focusedId) {
        pending = null;
        return;
      }
      if (!navigator.focus(pending)) return;
      pending = null;
      requested = false;
    },
  };
}

export type { FocusQueue };
export { focusQueue };
