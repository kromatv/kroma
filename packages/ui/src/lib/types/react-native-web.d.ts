// Props react-native-web adds to the React Native surface. They are no-ops on
// Apple TV and Android TV, which ignore unknown props.

import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    /** Rendered as `data-*` attributes. */
    dataSet?: Record<string, string | number | undefined> | undefined;
    tabIndex?: number | undefined;
  }
}
