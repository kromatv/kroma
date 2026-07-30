// THE web field box: one recipe behind every entry the app draws - the
// console's inputs, numbers, textareas and select chips, the module pages'
// search boxes, and the sign-in and dialog fields in the app itself.
//
// Lives in the admin kit because that's where the shared WEB primitives live
// (the app already imports its Image and Field from here); nothing about a
// field is admin-only.
//
// These are class strings, not components, so a one-off hand-rolled field can
// wear the same box without being rewritten into a primitive first.

// `surface-2` rather than a darker well: a field must read as a field on both
// surfaces it appears on - inset on a console card, and on the bare page
// behind the sign-in form, where a near-black fill left only a hairline
// border.
const EDGE =
  'min-w-0 rounded-[9px] border border-border-strong bg-surface-2 text-text outline-none transition-colors';

// No type scale: a field needing another one (a mono path template) swaps it
// in without two `text-*` utilities competing - Tailwind resolves that by
// stylesheet order, not write order.
export const FIELD_BOX = `${EDGE} px-3.5 py-2.25 focus:border-accent`;

export const FIELD_BOX_LG = `${EDGE} px-4 py-3.5 focus:border-accent`;

export const FIELD_TYPE = 'text-[13.5px] font-semibold';
export const FIELD_TYPE_LG = 'text-[15px] font-semibold';

// For data rather than prose (a path template, an API key): replaces
// FIELD_TYPE, never sits next to it.
export const FIELD_MONO = 'font-mono text-[13px]';

// Vertical space FIELD_BOX puts around one line: py-2.25 twice plus the 1px
// border top and bottom. A textarea with `field-sizing: content` ignores
// `rows` outright, so it needs this added back to state a floor in lines.
export const FIELD_PAD_Y = '1.125rem + 2px';

export const FIELD = `${FIELD_BOX} ${FIELD_TYPE}`;
export const FIELD_LG = `${FIELD_BOX_LG} ${FIELD_TYPE_LG}`;

// Wraps a control (a search box with a glyph, an entry with a button glued
// on): minus vertical padding, since the control carries that so the whole
// box stays the click target. The control needs `data-focus-ring="off"` (and
// `bg-transparent outline-none`) to move the focus visual onto this box; see
// clients/web/src/styles.css.
export const FIELD_GROUP = `${EDGE} flex items-center gap-2 px-3.5 focus-within:border-accent`;
