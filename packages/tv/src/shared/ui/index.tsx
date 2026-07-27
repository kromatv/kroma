// The TV app's own 10-foot pieces: brand mark, the radial auth backdrop, a wall
// clock, and the on-screen keyboard for server URLs / search. Everything generic
// has moved to @kroma/ui/kit (the PIN keypad went there next to <PinField>);
// what stays here is what depends on the TV app's own state (the device's
// keyboard-layout preference, the router).
//
// Split by kind into sibling modules; this barrel keeps every export's name and
// the single `#tv/shared/ui` import path stable.

export { AuthScreen } from '#tv/shared/ui/AuthScreen';
export { KromaMark, useClock } from '#tv/shared/ui/brand';
export { OnScreenKeyboard } from '#tv/shared/ui/keyboard';
export { artUrl, hostOf } from '#tv/shared/ui/util';
