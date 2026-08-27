import { cssRef } from '../core/tokens/css-var.ts';
import { breakpoint } from '../core/tokens/layout.ts';
import { atMedia, rule, type SheetEntry } from './sheet.ts';

const ROW_PAD_Y = 12;

const INSET_RING = 'calc(-1 * (var(--ring-gap) + var(--ring-width)))';

const tint = (percent: number) => `color-mix(in srgb, ${cssRef('tint')} ${percent}%, transparent)`;

const WIDE = ['.admin-table-head > [data-wide]', '.admin-table-row > [data-wide]'];

const ROWS = ['.admin-table-head', '.admin-table-row'];

/** The admin tables (`<Table>` in @kroma/module-sdk). */
export const ADMIN_TABLE: readonly SheetEntry[] = [
  rule(ROWS, {
    display: 'grid',
    gridTemplateColumns: 'var(--admin-table-narrow, minmax(0, 1fr) auto)',
    alignItems: 'center',
    gap: '16px',
    width: '100%',
    margin: 0,
    padding: `${ROW_PAD_Y}px 20px`,
    appearance: 'none',
    border: 0,
    background: 'none',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left',
  }),
  rule('.admin-table-head', {
    background: cssRef('surface1'),
    borderBottom: `1px solid ${tint(6)}`,
  }),
  rule('.admin-table-row', { borderBottom: `1px solid ${tint(4)}` }),
  rule('.admin-table-row:last-child', { borderBottom: 0 }),
  // A pressable row is a <button> UNDER its cells rather than around them, because
  // a button cannot hold the action buttons a row carries.
  rule('[data-pressable]', {
    position: 'relative',
    transition: 'background-color var(--dur-fast) var(--ease-out)',
  }),
  rule('.admin-table-row[data-pressable]:hover', { background: tint(3) }),
  rule('[data-pressable] > *:not(.admin-press)', { pointerEvents: 'none' }),
  rule('[data-pressable] :is(a, button, input, select, textarea, [tabindex], [data-hoverable])', {
    pointerEvents: 'auto',
  }),
  rule('.admin-table-head > [data-pressable]', {
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
  }),
  rule('.admin-table-head > [data-pressable] > .admin-press', {
    top: `-${ROW_PAD_Y}px`,
    bottom: `-${ROW_PAD_Y}px`,
  }),
  // The whole cell is the target, but a column is as wide as its widest ROW, so
  // ringing the cell draws a rule across empty space. The ring goes on the
  // label beside it, which is the part a reader is aiming at.
  rule('.admin-table-head .admin-press:focus-visible', { outline: 'none' }),
  rule('.admin-table-head .admin-press:focus-visible + *', {
    outline: 'var(--ring-outline)',
    outlineOffset: '3px',
    borderRadius: '4px',
  }),
  rule('.admin-press', {
    position: 'absolute',
    inset: 0,
    appearance: 'none',
    border: 0,
    background: 'none',
    cursor: 'pointer',
  }),
  rule('.admin-press:focus-visible', {
    outline: 'var(--ring-outline)',
    outlineOffset: INSET_RING,
  }),
  atMedia(`(min-width: ${breakpoint.md}px)`, [
    rule(ROWS, { gridTemplateColumns: 'var(--admin-table-columns)' }),
  ]),
  atMedia(`(max-width: ${breakpoint.md - 1}px)`, [rule(WIDE, { display: 'none' })]),
];
