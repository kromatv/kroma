import { Animated, Platform, View } from 'react-native';
import { usePressScale } from './focus-transition';
import { WEB } from './platform';
import { useFlatPress } from './press-dip';

const POINTING_TVS: ReadonlySet<string> = new Set(['android', 'webos']);

/** True on a television whose remote points: an Android TV box with an air mouse or a trackpad remote, an LG set with its Magic Remote. tvOS has none. */
export const TV_HAS_POINTER = Platform.isTV && POINTING_TVS.has(Platform.OS);

/** True where the spatial navigator is the only way in: a native television. */
export const NAVIGATED = Platform.isTV === true;

/** True on a native television with no pointer: nothing there can report a press. */
export const POINTERLESS = NAVIGATED && !TV_HAS_POINTER;

/** Whether a control can report a press: false only on a native television with no pointer. */
export const useCanPress = (): boolean => !POINTERLESS;

/** The press dip a touch control sinks with: flat on a native television, which focuses rather than presses. */
export const useControlDip = NAVIGATED ? useFlatPress : usePressScale;

/** The host a disabled control paints on: a plain view where styles are classes, an animated one where the scale is a value. */
export const StillHost = WEB ? View : Animated.View;
