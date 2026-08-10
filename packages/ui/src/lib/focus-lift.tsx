// Keeping the focused control on top, all the way up.
//
// `z-index` only orders siblings inside one stacking context, and
// react-native-web gives every view an explicit `z-index: 0`. So lifting the
// focused control lifts it within its own row and no further: the NEXT row is a
// separate container at the same level, and it paints over the focus ring and
// the focus scale of the row above regardless.
//
// A control therefore cannot solve this alone - every container between it and
// the screen has to rise with it. That is what this does: a control reports
// focus to the nearest <FocusLift>, which lifts itself AND reports up to the
// next one, so the whole chain from the tile to the screen rises together and
// falls back the moment focus leaves.
//
// It is wired into <Focusable> and the kit's focus containers, so components
// inherit it rather than each remembering to stack themselves.

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import type { ViewStyle } from 'react-native';

type Report = (focused: boolean) => void;

const LiftContext = createContext<Report | null>(null);

/** Report focus to the enclosing <FocusLift>; <Focusable> calls this. */
export function useFocusLift(): Report | null {
  return useContext(LiftContext);
}

/** One layer clear of a sibling, the same step <Focusable> and <ButtonGroup>
 *  use, so a control sitting in several of these cannot fight itself. */
export const LIFTED: ViewStyle = { zIndex: 1 };

/**
 * Makes its subtree's focus visible to a container, so the container can lift
 * ITSELF above its siblings while it holds the focus.
 *
 * Renders no element of its own, and that is the point: putting a wrapper view
 * inside a flex row turns N children into one and collapses the row.
 *
 * ```tsx
 * <FocusLiftHost>
 *   {(held) => <View style={[style, held ? LIFTED : null]}>{children}</View>}
 * </FocusLiftHost>
 * ```
 */
export function FocusLiftHost({ children }: Readonly<{ children: (held: boolean) => ReactNode }>) {
  const [held, setHeld] = useState(0);
  const parent = useFocusLift();

  const report = useMemo<Report>(
    () => (focused) => {
      setHeld((n) => {
        const next = Math.max(0, n + (focused ? 1 : -1));
        // Only the edges concern the parent: this subtree either holds the
        // focus or it does not, however many controls inside it come and go.
        if (n === 0 && next > 0) parent?.(true);
        if (n > 0 && next === 0) parent?.(false);
        return next;
      });
    },
    [parent],
  );

  return <LiftContext.Provider value={report}>{children(held > 0)}</LiftContext.Provider>;
}
