#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FACE = 'BricolageGrotesque-ExtraBold.ttf';
const FONT = fileURLToPath(new URL(`../src/assets/fonts/${FACE}`, import.meta.url));
const OUT = fileURLToPath(
  new URL('../src/components/atoms/numeral/numeral-glyphs.gen.ts', import.meta.url),
);
const DIGITS = '0123456789';

interface Point {
  x: number;
  y: number;
  on: boolean;
}

interface Outline {
  contours: Point[][];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME_OR_POSITIVE = 0x10;
const Y_SAME_OR_POSITIVE = 0x20;

function tablesOf(font: DataView): Map<string, number> {
  const tables = new Map<string, number>();
  const count = font.getUint16(4);
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    const tag = String.fromCodePoint(...[0, 1, 2, 3].map((b) => font.getUint8(at + b)));
    tables.set(tag, font.getUint32(at + 8));
  }
  return tables;
}

function table(tables: Map<string, number>, tag: string): number {
  const at = tables.get(tag);
  if (at === undefined) throw new Error(`${FACE} has no ${tag} table`);
  return at;
}

function glyphInSubtable(font: DataView, sub: number, code: number): number | undefined {
  const segments = font.getUint16(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const offsets = deltas + segments * 2;
  for (let s = 0; s < segments; s += 1) {
    if (code > font.getUint16(ends + s * 2)) continue;
    const start = font.getUint16(starts + s * 2);
    if (code < start) return undefined;
    const delta = font.getInt16(deltas + s * 2);
    const offset = font.getUint16(offsets + s * 2);
    if (offset === 0) return (code + delta) & 0xffff;
    const id = font.getUint16(offsets + s * 2 + offset + (code - start) * 2);
    return id === 0 ? 0 : (id + delta) & 0xffff;
  }
  return undefined;
}

function glyphIdOf(font: DataView, cmap: number, code: number): number {
  const subtables = font.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i += 1) {
    const sub = cmap + font.getUint32(cmap + 4 + i * 8 + 4);
    if (font.getUint16(sub) !== 4) continue;
    const glyph = glyphInSubtable(font, sub, code);
    if (glyph !== undefined) return glyph;
  }
  throw new Error(`${FACE} maps no glyph to U+${code.toString(16)}`);
}

function outlineOf(font: DataView, tables: Map<string, number>, glyph: number): Outline {
  const long = font.getInt16(table(tables, 'head') + 50) === 1;
  const loca = table(tables, 'loca');
  const offset = long ? font.getUint32(loca + glyph * 4) : font.getUint16(loca + glyph * 2) * 2;
  const at = table(tables, 'glyf') + offset;
  const contourCount = font.getInt16(at);
  if (contourCount < 0) throw new Error(`glyph ${glyph} is a composite, which a digit is not`);

  const ends: number[] = [];
  for (let c = 0; c < contourCount; c += 1) ends.push(font.getUint16(at + 10 + c * 2));
  const pointCount = (ends.at(-1) ?? -1) + 1;
  let cursor = at + 10 + contourCount * 2;
  cursor += 2 + font.getUint16(cursor);

  const flags: number[] = [];
  while (flags.length < pointCount) {
    const flag = font.getUint8(cursor);
    cursor += 1;
    const repeats = flag & REPEAT ? font.getUint8(cursor) : 0;
    if (flag & REPEAT) cursor += 1;
    for (let r = 0; r <= repeats; r += 1) flags.push(flag);
  }

  const axis = (short: number, sameOrPositive: number): number[] => {
    const values: number[] = [];
    let value = 0;
    for (const flag of flags) {
      if (flag & short) {
        const step = font.getUint8(cursor);
        cursor += 1;
        value += flag & sameOrPositive ? step : -step;
      } else if (!(flag & sameOrPositive)) {
        value += font.getInt16(cursor);
        cursor += 2;
      }
      values.push(value);
    }
    return values;
  };
  const xs = axis(X_SHORT, X_SAME_OR_POSITIVE);
  const ys = axis(Y_SHORT, Y_SAME_OR_POSITIVE);

  const contours: Point[][] = [];
  let first = 0;
  for (const end of ends) {
    const contour: Point[] = [];
    for (let p = first; p <= end; p += 1) {
      contour.push({ x: xs[p] ?? 0, y: ys[p] ?? 0, on: ((flags[p] ?? 0) & ON_CURVE) !== 0 });
    }
    contours.push(contour);
    first = end + 1;
  }
  return {
    contours,
    xMin: font.getInt16(at + 2),
    yMin: font.getInt16(at + 4),
    xMax: font.getInt16(at + 6),
    yMax: font.getInt16(at + 8),
  };
}

const between = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  on: true,
});

function ringOf(contour: Point[]): Point[] {
  const start = contour.findIndex((point) => point.on);
  if (start !== -1) return [...contour.slice(start), ...contour.slice(0, start)];
  const last = contour.at(-1);
  const head = contour[0];
  if (!last || !head) return [];
  return [between(last, head), ...contour];
}

function pathOf(contour: Point[], place: (point: Point) => string): string {
  const ring = ringOf(contour);
  const head = ring[0];
  if (!head) return '';
  const at = (index: number): Point => ring[index % ring.length] ?? head;
  let d = `M${place(head)}`;
  let index = 1;
  while (index < ring.length) {
    const point = at(index);
    const next = at(index + 1);
    if (point.on) {
      d += `L${place(point)}`;
      index += 1;
    } else if (next.on) {
      d += `Q${place(point)} ${place(next)}`;
      index += 2;
    } else {
      d += `Q${place(point)} ${place(between(point, next))}`;
      index += 1;
    }
  }
  return `${d}Z`;
}

const file = readFileSync(FONT);
const font = new DataView(file.buffer, file.byteOffset, file.byteLength);
const tables = tablesOf(font);
const cmap = table(tables, 'cmap');
const outlines = [...DIGITS].map((digit) =>
  outlineOf(font, tables, glyphIdOf(font, cmap, digit.codePointAt(0) ?? 0)),
);

const top = Math.max(...outlines.map((outline) => outline.yMax));
const bottom = Math.min(...outlines.map((outline) => outline.yMin));

const glyphs = outlines.map((outline) => {
  const place = (point: Point) =>
    `${Math.round(point.x - outline.xMin)} ${Math.round(top - point.y)}`;
  return {
    width: outline.xMax - outline.xMin,
    d: outline.contours.map((contour) => pathOf(contour, place)).join(''),
  };
});

const source = [
  `// Generated by packages/ui/scripts/numeral-glyphs.ts from ${FACE}. Do not edit:`,
  '// rerun the script.',
  '',
  '/** The height of the box every digit is drawn in, in the units of the paths. */',
  `export const NUMERAL_BOX = ${top - bottom};`,
  '',
  '/** The ten digits as outlines, each starting at its own left edge. */',
  'export const NUMERAL_GLYPHS: readonly { readonly width: number; readonly d: string }[] = [',
  ...glyphs.flatMap((glyph) => [
    '  {',
    `    width: ${glyph.width},`,
    `    d: '${glyph.d}',`,
    '  },',
  ]),
  '];',
  '',
].join('\n');

writeFileSync(OUT, source);
console.log(`${DIGITS.length} digits, box ${top - bottom}, written to ${OUT}`);
