// The TV app's own 10-foot pieces - the ones that depend on the app's own state
// (keyboard-layout preference, router). Everything generic lives in @kroma/ui/kit.

export { AUTH_BACKDROP, AuthScreen } from '#tv/shared/ui/AuthScreen';
export { GATE_MARK, KromaMark, useClock } from '#tv/shared/ui/brand';
export { SearchKeyboard, UrlKeyboard } from '#tv/shared/ui/keyboard';
export { artUrl, hostOf } from '#tv/shared/ui/util';
