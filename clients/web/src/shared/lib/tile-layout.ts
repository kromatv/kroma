import { cellWidth, columnsFor } from '@kroma/ui/kit';

export const TILE_GAP = 18;

export const TILE_ROW_GAP = 24;

const CARD_MIN = 132;
const CARD_MAX = 208;

// A poster is 2:3, and everything else a tile draws (caption, quick actions)
// is painted over the art rather than under it.
const POSTER_RATIO = 3 / 2;

function tileMin(room: number): number {
  return Math.min(CARD_MAX, Math.max(CARD_MIN, Math.round(room / 3)));
}

/** How many tiles a `room`-wide grid fits. Zero before the row is measured,
 * which is the caller's cue to draw nothing rather than one full-width tile. */
export function tileColumns(room: number): number {
  return room > 0 ? columnsFor(room, tileMin(room), TILE_GAP) : 0;
}

export function tileCell(room: number, columns: number): number {
  return cellWidth(room, columns, TILE_GAP);
}

export interface GridShape {
  columns: number;
  cell: number;
  pitch: number;
  rows: number;
  height: number;
}

const NO_SHAPE: GridShape = { columns: 0, cell: 0, pitch: 0, rows: 0, height: 0 };

/** Everything a grid of `items` lays out from, derived from one measured width.
 * One function, because a fresh column count beside a stale pitch reserves a
 * height the rows do not add up to and the page jumps by the difference. */
export function gridShape(room: number, items: number): GridShape {
  const columns = tileColumns(room);
  if (columns <= 0 || items <= 0) return NO_SHAPE;
  const cell = tileCell(room, columns);
  const pitch = Math.round(cell * POSTER_RATIO) + TILE_ROW_GAP;
  const rows = Math.ceil(items / columns);
  return { columns, cell, pitch, rows, height: rows * pitch - TILE_ROW_GAP };
}

export interface RowWindow {
  first: number;
  count: number;
}

export interface RowWindowInput {
  rows: number;
  pitch: number;
  top: number;
  viewport: number;
  overscan: number;
}

export function rowWindow({ rows, pitch, top, viewport, overscan }: RowWindowInput): RowWindow {
  if (rows <= 0) return { first: 0, count: 0 };
  if (pitch <= 0) return { first: 0, count: 1 };
  const firstSeen = Math.floor(-top / pitch);
  const lastSeen = Math.ceil((viewport - top) / pitch) - 1;
  const first = Math.min(Math.max(firstSeen - overscan, 0), rows - 1);
  const last = Math.min(lastSeen + overscan, rows - 1);
  return { first, count: Math.max(last - first + 1, 0) };
}

export interface GridGeometry {
  top: number;
  bottom: number;
  columns: number;
  pitch: number;
}

export interface RowBounds {
  top: number;
  bottom: number;
}

export function rowBounds(geometry: GridGeometry, itemIndex: number): RowBounds {
  const top = geometry.top + Math.floor(itemIndex / geometry.columns) * geometry.pitch;
  return { top, bottom: top + geometry.pitch - TILE_ROW_GAP };
}
