import { describeScreen } from './describe-screen';
import type { HostBox } from './host-box';
import type { PropValue } from './prop-summary';
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

function rowText(row: ScreenRow): string {
  const parts = [
    row.focused ? `${row.name} (focused)` : row.name,
    row.box ? boxText(row.box) : '',
    Object.entries(row.props)
      .flatMap(([key, value]) => propText(key, value))
      .join(' '),
  ];
  return `${'  '.repeat(row.depth)}${parts.filter(Boolean).join('  ')}`;
}

/** A screen as text, one kit component a line, indented two spaces a level:
 *  its name, `(focused)` on the one that holds the focus, its box as
 *  `x,y widthxheight`, then its props. A prop that is `true` is its name alone,
 *  and one that is not a primitive (a function, an element, an object) is left
 *  out. Reads what is on screen now when given no rows. */
export function screenText(screen: ScreenRows = screenRows(describeScreen())): string {
  const lines = screen.rows.map(rowText);
  if (screen.truncated) {
    lines.push(`… cut at ${screen.rows.length} components`);
  }
  return lines.join('\n');
}
