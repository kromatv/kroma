import type { HostBox } from './host-box';
import type { PropSummary } from './prop-summary';
import type { ScreenControl } from './screen-controls';
import type { KitNode, ScreenTree } from './screen-tree';
import type { TextClip } from './text-clip';

/** One mounted kit component, `depth` levels under the top of the screen. */
export type ScreenRow = {
  depth: number;
  name: string;
  props: PropSummary;
  box: HostBox | null;
  focused?: true;
  clipped?: TextClip;
  control?: ScreenControl;
};

/** A screen as rows in document order: a parent comes before its children, and
 *  a row's children are the rows after it one level deeper. */
export type ScreenRows = { fibers: number; truncated: boolean; rows: ScreenRow[] };

/** The most rows {@link screenRows} keeps. */
export const MAX_SCREEN_ROWS = 2000;

/** The most UTF-8 bytes the kept rows take as JSON, so an answer stays under
 *  the 1 MiB a server reads from a socket. */
export const MAX_SCREEN_BYTES = 1_000_000;

type Pending = { node: KitNode; depth: number };

function pointBytes(point: number): number {
  if (point < 0x80) {
    return 1;
  }
  if (point < 0x800) {
    return 2;
  }
  return point < 0x10000 ? 3 : 4;
}

function jsonBytes(value: unknown): number {
  const text = JSON.stringify(value);
  let bytes = 0;
  let at = 0;
  while (at < text.length) {
    const point = text.codePointAt(at) ?? 0;
    bytes += pointBytes(point);
    at += point < 0x10000 ? 1 : 2;
  }
  return bytes;
}

function pushChildren(pending: Pending[], { node, depth }: Pending): void {
  for (let i = node.children.length - 1; i >= 0; i -= 1) {
    const child = node.children[i];
    if (child) {
      pending.push({ node: child, depth: depth + 1 });
    }
  }
}

function rowOf({ node, depth }: Pending): ScreenRow {
  const row: ScreenRow = { depth, name: node.name, props: node.props, box: node.box };
  if (node.focused) {
    row.focused = true;
  }
  if (node.clipped) {
    row.clipped = node.clipped;
  }
  if (node.control) {
    row.control = node.control;
  }
  return row;
}

/** Flattens a screen tree into rows, without recursion, and stops at
 *  {@link MAX_SCREEN_ROWS} rows or {@link MAX_SCREEN_BYTES} bytes, saying so in
 *  `truncated`. */
export function screenRows(tree: ScreenTree): ScreenRows {
  const rows: ScreenRow[] = [];
  const pending: Pending[] = [];
  pushChildren(pending, {
    node: { name: '', props: {}, box: null, children: tree.nodes },
    depth: -1,
  });
  let bytes = 0;
  for (let next = pending.pop(); next; next = pending.pop()) {
    const row = rowOf(next);
    bytes += jsonBytes(row) + 1;
    if (rows.length === MAX_SCREEN_ROWS || bytes > MAX_SCREEN_BYTES) {
      return { fibers: tree.fibers, truncated: true, rows };
    }
    rows.push(row);
    pushChildren(pending, next);
  }
  return { fibers: tree.fibers, truncated: false, rows };
}
