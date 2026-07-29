// THE web field box.
//
// One recipe behind every entry the app draws - the console's inputs, numbers,
// textareas and select chips, the module pages' search boxes, and the sign-in
// and dialog fields out in the app itself. They had drifted into four fills
// (a near-black well, `surface-2`, `bg-bg`, a dialog's own `#15151A`), three
// radii and four type scales between them, and a form that stacks a black
// input, a grey textarea and a grey chip reads as three unrelated controls
// rather than one form.
//
// It lives in the admin kit because that is where the shared WEB primitives
// live (the app already imports its Image and its Field from here); nothing
// about a field is admin-only.
//
// These are class strings rather than components so the one-off fields a screen
// still hand-rolls (a filter bar, a modal's single input) can wear the same box
// by importing one, without being rewritten into a primitive first.

/**
 * Fill, edge, radius, and the accent border a field lights up with.
 *
 * `surface-2` rather than a darker well, because a field has to read as a field
 * on BOTH of the surfaces this app puts one on: inset on a console card, and on
 * the bare page behind the sign-in form, where a near-black fill left nothing
 * but a hairline border.
 */
const EDGE =
  'min-w-0 rounded-[9px] border border-border-strong bg-surface-2 text-text outline-none transition-colors';

/** The box, at the size a form full of fields uses. Carries NO type scale - a
 * field that needs another one (a mono path template) swaps it in without two
 * `text-*` utilities fighting over the same element, which Tailwind resolves by
 * stylesheet order rather than by the order they were written in. */
export const FIELD_BOX = `${EDGE} px-3.5 py-2.25 focus:border-accent`;

/** The box, at the size a screen whose form IS the screen uses: sign-in,
 * register, the join flow. Same box, more room. */
export const FIELD_BOX_LG = `${EDGE} px-4 py-3.5 focus:border-accent`;

/** What a field's own text reads like, at each of the two sizes. */
export const FIELD_TYPE = 'text-[13.5px] font-semibold';
export const FIELD_TYPE_LG = 'text-[15px] font-semibold';

/** A field holding DATA rather than prose - a path template, a WireGuard
 * config, an API key - where the character grid is what makes it readable.
 * Replaces {@link FIELD_TYPE}; never sits next to it. */
export const FIELD_MONO = 'font-mono text-[13px]';

/** The vertical space {@link FIELD_BOX} puts around one line of text: `py-2.25`
 * twice, plus its 1px edge top and bottom (the box is `border-box`, so a height
 * has to cover the border as well). A textarea that sizes itself to its CONTENT
 * has to add this back to state a floor in lines - `field-sizing: content`
 * ignores the `rows` attribute outright, which is how a three-line field ends up
 * one line tall. */
export const FIELD_PAD_Y = '1.125rem + 2px';

/** Box + type: the whole recipe, for a field with nothing special to say. */
export const FIELD = `${FIELD_BOX} ${FIELD_TYPE}`;
export const FIELD_LG = `${FIELD_BOX_LG} ${FIELD_TYPE_LG}`;

/**
 * The field that WRAPS its control: a search box with a glyph in it, an entry
 * with a button glued on. Same box, minus the vertical padding - the control
 * inside carries that, so the whole box stays the click target for it, and one
 * group serves both sizes.
 *
 * The control inside goes `data-focus-ring="off"` (and `bg-transparent
 * outline-none`), which is what moves the focus visual out here, onto the box a
 * reader actually sees. See the field rules in clients/web/src/styles.css.
 */
export const FIELD_GROUP = `${EDGE} flex items-center gap-2 px-3.5 focus-within:border-accent`;
