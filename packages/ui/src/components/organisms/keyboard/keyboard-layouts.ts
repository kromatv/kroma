// Letter-row data for the on-screen keyboards, per selectable layout. Rows are
// uppercase; the search keyboard renders them as-is (inserting lowercase), the
// URL keyboard flattens them into rows of ten lowercase keys.

/**
 * The letter orders a host can ask for.
 *
 *  - `abc`    : alphabetical rows (the classic TV grid).
 *  - `azerty` : French typewriter order.
 *  - `qwerty` : US/UK typewriter order.
 *  - `qwertz` : German/Swiss typewriter order.
 */
export type KeyboardLayout = 'abc' | 'azerty' | 'qwerty' | 'qwertz';

/** In picker order. */
export const KEYBOARD_LAYOUTS: readonly KeyboardLayout[] = ['abc', 'azerty', 'qwerty', 'qwertz'];

// The last row of each layout is deliberately short: the search keyboard
// appends space / backspace / close to it.
export const LAYOUT_LETTER_ROWS: Record<KeyboardLayout, readonly (readonly string[])[]> = {
  // Ten a row, like every typewriter layout below and like the digits row
  // above them: a six-column grid left the alphabet in a narrow tower beside
  // a full-width row of digits.
  abc: [
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
    ['U', 'V', 'W', 'X', 'Y', 'Z'],
  ],
  azerty: [
    ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
    ['W', 'X', 'C', 'V', 'B', 'N'],
  ],
  qwerty: [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ],
  qwertz: [
    ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Y', 'X', 'C', 'V', 'B', 'N', 'M'],
  ],
};

/** The delete key's identity in a layout. A NAME rather than the "\u232B"
 * glyph: the row is data the renderer reads, and a key that draws an icon
 * cannot be identified by the character it no longer prints. */
export const DELETE_KEY = 'delete';

function buildUrlRows(layout: KeyboardLayout): readonly (readonly string[])[] {
  const keys = [
    ...LAYOUT_LETTER_ROWS[layout].flat().map((l) => l.toLowerCase()),
    '-',
    ':',
    '/',
    DELETE_KEY,
  ];
  const rows: string[][] = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']];
  for (let i = 0; i < keys.length; i += 10) rows.push(keys.slice(i, i + 10));
  return rows;
}

/**
 * Digits row, then the layout's lowercase letters chunked into rows of ten with
 * the URL specials appended to the tail (26 letters + 4 specials = three even
 * rows).
 *
 * A table rather than the function that builds one: the React Compiler cannot
 * memoise a call to an imported function, so a keyboard that asked for its rows
 * through one got a fresh array every render, and rebuilt all forty-odd key
 * elements with it. A member read off a constant it can hold still.
 */
export const URL_ROWS = Object.fromEntries(
  KEYBOARD_LAYOUTS.map((layout) => [layout, buildUrlRows(layout)]),
) as Record<KeyboardLayout, readonly (readonly string[])[]>;
