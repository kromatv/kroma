/// <reference path="../../../../lib/types/react-native-tv.d.ts" />
// Host props that keep a player-chrome control OUT of the OS focus engine.
// Without this, tvOS's OS engine adopts the chrome in parallel with the
// player's own virtual focus (usePlayerNav), since every Pressable is focusable
// by default. react-native-tvos gates on exactly `focusable !== false &&
// isTVSelectable !== false`.

/** Spread onto any player-chrome Pressable. See the file header for why. */
export { UNFOCUSABLE as VIRTUAL_FOCUS } from '#ui/lib/focus-types';
