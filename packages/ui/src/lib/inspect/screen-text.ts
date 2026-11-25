import { describeScreen } from './describe-screen';
import type { HostBox } from './host-box';
import type { PropSummary, PropValue } from './prop-summary';
import type { ScreenControl } from './screen-controls';
import { type ScreenRow, type ScreenRows, screenRows } from './screen-rows';

const TAG = /^\[(?:function|element|object|symbol|bigint|array \d+)\]$/;

function propText(key: string, value: PropValue): string[] {
  if (value === true) {
    return [key];
  }
  if (typeof value !== 'string') {
    return [`${key}=${String(value)}`];
  }
  return TAG.test(value) ? [] : [`${key}=${JSON.stringify(value)}`];
}

function boxText(box: HostBox): string {
  const [x, y, width, height] = [box.x, box.y, box.width, box.height].map(Math.round);
  return `${x},${y} ${width}x${height}`;
}

const NO_STATE: PropSummary = {};

function propsText(props: PropSummary, state: PropSummary): string {
  return Object.entries(props)
    .filter(([key]) => !(key in state))
    .flatMap(([key, value]) => propText(key, value))
    .join(' ');
}

function stateText(key: string, value: PropValue): string {
  const quoted = typeof value === 'string' && !TAG.test(value);
  return `${key}=${quoted ? JSON.stringify(value) : String(value)}`;
}

function controlText(control: ScreenControl | undefined): string[] {
  if (!control) {
    return [];
  }
  const state = Object.entries(control.state).map(([key, value]) => stateText(key, value));
  const actions = control.actions.length > 0 ? `actions: ${control.actions.join(', ')}` : '';
  return [`state: ${state.join(' ')}`, actions];
}

function headText(row: ScreenRow): string {
  const name = row.control ? `${row.name} [${row.control.ref}]` : row.name;
  return row.focused ? `${name} (focused)` : name;
}

function rowText(row: ScreenRow): string {
  const parts = [
    headText(row),
    row.box ? boxText(row.box) : '',
    propsText(row.props, row.control?.state ?? NO_STATE),
    ...controlText(row.control),
  ];
  return `${'  '.repeat(row.depth)}${parts.filter(Boolean).join('  ')}`;
}

/** A screen as text, one kit component a line, indented two spaces a level:
 *  its name, `(focused)` on the one that holds the focus, its box as
 *  `x,y widthxheight`, then its props. A prop that is `true` is its name alone,
 *  and one that is not a primitive (a function, an element, an object) is left
 *  out. A component that runs a control has its ref after its name, `[c4]`,
 *  and ends with `state:` and the `actions:` a call may ask of it now; its
 *  state is not repeated among its props. Reads what is on screen now when
 *  given no rows. */
export function screenText(screen: ScreenRows = screenRows(describeScreen())): string {
  const lines = screen.rows.map(rowText);
  if (screen.truncated) {
    lines.push(`… cut at ${screen.rows.length} components`);
  }
  return lines.join('\n');
}
