/// <reference path="../../../../lib/types/react-native-tv.d.ts" />
// Host props that keep a player-chrome control OUT of the OS focus engine.
//
// The player is the one screen in the app that does not use platform focus. Its
// controls are drawn from a `focused` prop that `usePlayerNav` computes (a zone
// plus an index), because the transport has to survive the chrome fading out,
// the progress bar scrubs by held direction, and a panel slides in over the top
// - none of which a focus ring moving between real focusables can express.
//
// On tvOS every `Pressable` is focusable by default, so the OS engine happily
// adopted this chrome in parallel: it would move a second, invisible focus
// around, and the Select that ENTERED the player landed on whichever control it
// had adopted. That control was the top bar's back button, so opening the player
// closed it again, roughly one frame later. The film started and stopped.
//
// So the chrome opts out, and the remote reaches it through `usePlayerKeys`
// instead. `focusable` is the whole story on both Apple TV and Android TV:
// react-native-tvos gates a Pressable on exactly `focusable !== false &&
// isTVSelectable !== false`.

/** Spread onto any player-chrome Pressable. See the file header for why. */
export { UNFOCUSABLE as VIRTUAL_FOCUS } from '#ui/lib/focus-types';
