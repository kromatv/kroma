import { cssRef } from '../core/tokens/css-var.ts';
import { breakpoint } from '../core/tokens/layout.ts';
import { atMedia, rule, type SheetEntry } from './sheet.ts';

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
    padding: '12px 20px',
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
