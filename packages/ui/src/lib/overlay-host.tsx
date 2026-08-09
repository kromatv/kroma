// <OverlayHost>: where a surface that must float over a whole SCREEN renders.
//
// React Native has no portal, and the thing it offers instead - <Modal> - cannot
// be used on a television. On tvOS a modal is presented as its own UIViewController
// with its own remote handler, and that handler only receives presses once the
// system's focus engine has moved focus into that window. This app's focus is
// VIRTUAL (see components/atoms/focusable): nothing on a screen is natively
// focusable, so the engine has no reason to move, the modal's window never gets a
// press, and every dialog is a picture of a dialog - no directions, no OK, and no
// way out, because the menu key is disabled inside a modal too (RN disables it and
// closes natively instead, which also never fires).
//
// So a television renders its dialogs INSIDE the app, above everything, and the
// remote never leaves the window it was already working in.
//
// It is a wrapper rather than a free-floating root because that is what lets a
// dialog find it: the host provides the mount function by context, so a <Dialog>
// anywhere below - a settings row inside a scroll view, a chip in the top bar -
// renders its panel up here instead of where it was written, and is neither
// clipped by an ancestor nor laid out inside a list.
//
// NOT lib/portal.tsx, which reads similarly and answers a different question.
// That one is a WINDOW portal: on the web it escapes to `document.body`, which
// is what a surface has to do to get OUT of <TvStage>'s transform (the brand
// intro), and on native it is the identity. This is a STAGE overlay: it stays
// inside the stage, because a dialog is measured in the same 1920 coordinates
// as the screen it covers.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from 'react';
import type { ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';

/** Puts `node` in the host's layer under `id`, or takes it out with `null`. */
type Mount = (id: string, node: ReactNode | null) => void;

const OverlayMount = createContext<Mount | null>(null);

/** Above the player (60) and the toaster (90): a dialog is modal, so it is over
 * everything the app can otherwise draw. */
const LAYER = 95;

export function OverlayHost({ children }: Readonly<{ children: ReactNode }>) {
  const [slots, setSlots] = useState<ReadonlyMap<string, ReactNode>>(EMPTY);

  const mount = useCallback<Mount>((id, node) => {
    setSlots((prev) => {
      // Same element as last time (a caller re-rendered without changing it):
      // returning `prev` is what keeps this from re-rendering the host forever.
      if (prev.get(id) === node) return prev;
      if (node == null && !prev.has(id)) return prev;
      const next = new Map(prev);
      if (node == null) next.delete(id);
      else next.set(id, node);
      return next;
    });
  }, []);

  return (
    <OverlayMount.Provider value={mount}>
      {children}
      {slots.size > 0 ? (
        // `box-none`: the layer itself catches nothing, so a dialog's own scrim
        // decides what is clickable and the screen underneath is not blocked by
        // an empty full-screen box.
        <Box fill z={LAYER} style={PASS_THROUGH}>
          {[...slots].map(([id, node]) => (
            <Box key={id} fill style={PASS_THROUGH}>
              {node}
            </Box>
          ))}
        </Box>
      ) : null}
    </OverlayMount.Provider>
  );
}

const EMPTY: ReadonlyMap<string, ReactNode> = new Map();

const PASS_THROUGH: ViewStyle = { pointerEvents: 'box-none' };

/**
 * Is there a host above this? Answerable before the node exists, which is what
 * lets a caller decide what to BUILD from it - a dialog's panel behaves
 * differently in a host than in the <Modal> it otherwise falls back to.
 *
 * `false` is not a failure: an app with no host (the browser client, a phone)
 * has no reason for one, and the caller keeps whatever it did before.
 */
export function useOverlayHost(): boolean {
  return useContext(OverlayMount) != null;
}

/**
 * Render `node` in the nearest <OverlayHost>, and say whether there was one.
 *
 * The node renders in the HOST's position in the React tree, so it reads the
 * context the host sits in rather than the caller's. Everything app-wide (the
 * client, the locale, the theme) is above the host and therefore still there; a
 * context opened by a single screen is not, which is the one thing to know
 * before putting a screen's own provider around a dialog's content.
 */
export function useOverlay(node: ReactNode | null): boolean {
  const mount = useContext(OverlayMount);
  const id = useId();

  useEffect(() => {
    mount?.(id, node);
  }, [mount, id, node]);

  // Separate, and empty on purpose: the effect above re-runs whenever the node
  // changes, and a cleanup there would take the panel out and put it back on
  // every render of the caller. This one runs once, when the caller leaves.
  useEffect(() => () => mount?.(id, null), [mount, id]);

  return mount != null;
}
