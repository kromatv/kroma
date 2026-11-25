import { describeScreen } from './describe-screen';
import type { HostBox } from './host-box';
import type { ScreenControl } from './screen-controls';
import { type ScreenRow, type ScreenRows, screenRows } from './screen-rows';

/** A control on screen: the component that runs it, what a read says of the
 *  control, its box, and whether it holds the focus. */
export type ControlRow = ScreenControl & { name: string; box: HostBox | null; focused?: true };

function controlRow({ control, name, box, focused }: ScreenRow): ControlRow[] {
  if (!control) {
    return [];
  }
  const { ref, kind, state, actions } = control;
  const row: ControlRow = { ref, name, kind, state, actions, box };
  if (focused) {
    row.focused = true;
  }
  return [row];
}

/** The controls on screen, in document order: each with the ref a call names
 *  it by, its state, and the setters and actions it takes now. Reads what is
 *  on screen now when given no rows. */
export function snapshot(screen: ScreenRows = screenRows(describeScreen())): ControlRow[] {
  return screen.rows.flatMap(controlRow);
}
