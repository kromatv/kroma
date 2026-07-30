// react-native-tvos ships its TV surface as a `declare module 'react-native'`
// block inside its own type package, which TypeScript drops (a package cannot
// augment itself), so the slice of the TV API this kit uses is restated here.
// `hasTVPreferredFocus` is deliberately absent: core React Native already
// declares it on ViewProps and redeclaring it conflicts.

import type { ComponentType } from 'react';
import 'react-native';

declare module 'react-native' {
  export type HWEvent = {
    eventType: string;
    /** 0 = key down, 1 = key up. Absent on platforms that only report presses. */
    eventKeyAction?: number | undefined;
    tag?: number | undefined;
  };

  /** Remote events the OS focus engine does not route to a focusable (Back /
   * Menu, transport keys, gestures). */
  export const useTVEventHandler: (handleEvent: (event: HWEvent) => void) => void;

  /** The same stream outside React. Undefined on a build without the TV
   * surface (the phone app). */
  export const TVEventHandler:
    | { addListener: (callback: (event: HWEvent) => void) => { remove: () => void } }
    | undefined;

  export const TVEventControl: {
    enableTVMenuKey(): void;
    disableTVMenuKey(): void;
    enableTVPanGesture(): void;
    disableTVPanGesture(): void;
    enableGestureHandlersCancelTouches(): void;
    disableGestureHandlersCancelTouches(): void;
  };

  /** A region the OS focus engine can be steered into; `autoFocus` hands focus
   * to its first focusable child. */
  export const TVFocusGuideView: ComponentType<
    ViewProps & {
      /** Component instances or node handles. */
      destinations?: unknown[] | undefined;
      autoFocus?: boolean | undefined;
      trapFocusUp?: boolean | undefined;
      trapFocusDown?: boolean | undefined;
      trapFocusLeft?: boolean | undefined;
      trapFocusRight?: boolean | undefined;
    }
  >;

  /**
   * A hardware key, as Fabric reports it to a view (Android). Spelled the way
   * the web spells it: KEYCODE_DPAD_UP is `"ArrowUp"`, KEYCODE_DPAD_CENTER is
   * `"Enter"`. KEYCODE_BACK is not in that table - Back stays with BackHandler.
   */
  export type TVKeyEvent = {
    /** `ArrowUp`, `Enter` - or the character itself for anything printable. */
    key: string;
    /** The physical key. The one to switch on. */
    code: string;
    repeat?: boolean | undefined;
    altKey?: boolean | undefined;
    ctrlKey?: boolean | undefined;
    metaKey?: boolean | undefined;
    shiftKey?: boolean | undefined;
  };

  interface ViewProps {
    scrollSnapAlign?: 'start' | 'center' | 'end' | undefined;
    /** Android only, behind the `enableKeyEvents` feature flag - see
     * clients/tv-native/plugins/with-tv-key-events.js. */
    onKeyDown?: ((event: NativeSyntheticEvent<TVKeyEvent>) => void) | undefined;
    onKeyUp?: ((event: NativeSyntheticEvent<TVKeyEvent>) => void) | undefined;
  }
}
