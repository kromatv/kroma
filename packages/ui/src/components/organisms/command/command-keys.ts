// The palette's keys on the native targets, which is deliberately nothing.
//
// A television has no keyboard cursor. Every row is a `Focusable`, so the
// spatial navigator already walks them with the D-pad and Select already
// presses one - and a palette that ALSO held the remote and moved a cursor of
// its own would put two highlights on screen, with Select opening whichever
// one the reader was not looking at. The web half takes the keys because a
// browser is the only place a keyboard cursor exists.
//
// Back is not read here either: the shell's own dismissal already owns it.

import type { CommandKeysOptions } from './command-keys-types';

function useCommandKeys(_options: CommandKeysOptions): void {
  // Empty on purpose, for the reason above.
}

export { useCommandKeys };
