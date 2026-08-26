import { rule, type SheetEntry } from './sheet.ts';

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

const FLOW = [...HEADINGS, 'p', 'ul', 'ol', 'dl', 'dd', 'pre', 'figure', 'blockquote'];

const FIELDS = ['button', 'input', 'optgroup', 'select', 'textarea'];

export const RESET: readonly SheetEntry[] = [
  rule(['*', '*::before', '*::after'], { boxSizing: 'border-box' }),
  rule('a', { color: 'inherit', textDecoration: 'none' }),
  rule(FLOW, { margin: 0 }),
  rule(['ul', 'ol'], { padding: 0, listStyle: 'none' }),
  rule(HEADINGS, { fontSize: 'inherit', fontWeight: 'inherit' }),
  rule(FIELDS, {
    margin: 0,
    padding: 0,
    border: 0,
    borderRadius: 0,
    background: 'transparent',
    font: 'inherit',
    letterSpacing: 'inherit',
    color: 'inherit',
  }),
  // A browser gives a bare <button> no cursor of its own, so every control the
  // shells build from an element rather than from the kit falls back to the
  // page's arrow. The kit's own controls state their cursor in `lib/cursor`.
  rule(['button', '[role="button"]', 'summary', 'label[for]'], { cursor: 'pointer' }),
  rule([':disabled', '[aria-disabled="true"]'], { cursor: 'default' }),
  // `cursor` inherits, so a field inside anything that states the hand drew it
  // over its own text.
  rule(['input', 'textarea'], { cursor: 'auto' }),
  // A rounded control is hit-tested against its rounded shape, so the pointer
  // falls through its corners onto whatever is behind. The square pseudo answers
  // with the control's own rectangle instead, since a descendant is not clipped
  // by its parent's radius.
  // It stops at the control's edge because react-native-web gives every View
  // `position: relative; z-index: 0`: each control is its own stacking context,
  // so `z-index: -1` cannot get behind the one beside it and an overhang would
  // take the pointer over a sibling that paints earlier. That same default is
  // why `[role="button"]` is NOT in the list below: naming the attribute here
  // would out-weigh the atomic class an absolutely positioned control is given,
  // collapsing it onto its content.
  rule(['button', 'summary'], { position: 'relative' }),
  rule(['button::after', '[role="button"]::after', 'summary::after'], {
    content: '""',
    position: 'absolute',
    inset: 0,
    zIndex: -1,
  }),
];
