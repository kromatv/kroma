import type { Control, ControlEngine } from '../control';
import { mountedAnchors } from './mounted-anchors';

/** A mounted control, the engine that lists it, and which of the page's
 *  `KitProvider` trees that engine belongs to, counted from 0. */
export type Mounted = { control: Control; engine: ControlEngine; tree: number };

/** The name a call gives a control: `c4` in a page's first tree, `2:c4` in its
 *  second. It is the control's own for as long as it is mounted. */
export function refOf({ control, engine, tree }: Mounted): string {
  const ref = engine.ref(control);
  return tree === 0 ? ref : `${tree + 1}:${ref}`;
}

/** Every control mounted under every `KitProvider`. */
export function mountedControls(): Mounted[] {
  const engines = new Set([...mountedAnchors].map((anchor) => anchor.props.controls));
  return [...engines].flatMap((engine, tree) =>
    engine.controls().map((control) => ({ control, engine, tree })),
  );
}
