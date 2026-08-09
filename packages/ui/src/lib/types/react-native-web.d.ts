// Props react-native-web adds to the React Native surface. They are no-ops on
// Apple TV and Android TV, which ignore unknown props.

import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    /** Rendered as `data-*` attributes. */
    dataSet?: Record<string, string | number | undefined> | undefined;
    tabIndex?: number | undefined;
    /** Physical-keyboard key handling; react-native-web forwards it to the
     *  element, and DOM events bubble to it from any focused child. */
    onKeyDown?: ((event: KeyboardBubble) => void) | undefined;
    /** The active-row wiring of the aria-activedescendant listbox pattern. */
    'aria-activedescendant'?: string | undefined;
  }
}

/** The slice of react-native-web's keyboard event the kit reads. */
interface KeyboardBubble {
  nativeEvent: { key: string };
  preventDefault: () => void;
  stopPropagation: () => void;
}
