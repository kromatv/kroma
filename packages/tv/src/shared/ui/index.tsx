// The TV app's own 10-foot pieces - the ones that depend on the app's own state
// (keyboard-layout preference, router). Everything generic lives in @kromatv/ui/kit.

export {
  AUTH_BACKDROP,
  AuthScreen,
  BeaconMark,
  RADIAL_GROUND,
} from '#tv/shared/ui/auth-screen.component';
export { GATE_MARK, KromaMark, useClock } from '#tv/shared/ui/brand';
export { ScreenClock, WallClock } from '#tv/shared/ui/clock.component';
export { SearchKeyboard, UrlKeyboard } from '#tv/shared/ui/keyboard.component';
export { artUrl, hostOf } from '#tv/shared/ui/util';
