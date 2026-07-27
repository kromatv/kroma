// JS face of the local Apple TV search module.
//
// Optional, like the Siri module: it is declared for Apple only, so an Android
// TV build does not ship it and asking for it must return null rather than
// throw.

import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType, ReactNode } from 'react';
import type { ViewProps } from 'react-native';

export interface NativeSearchViewProps extends ViewProps {
  /** Placeholder for the platform's search field. */
  placeholder: string;
  /** The query, pushed in (Siri, a recent search). Typing comes back out
   * through `onChangeText`, so this must not be re-sent on every keystroke. */
  text: string;
  onChangeText: (event: { nativeEvent: { text: string } }) => void;
  /** The room tvOS left for the results, in points. React only learns it from
   * here: the keyboard's width is the platform's business, not ours. */
  onLayoutResults: (event: { nativeEvent: { width: number; height: number } }) => void;
  children?: ReactNode;
}

/** The native search view, or null on a platform that does not ship it. */
export const NativeSearchView: ComponentType<NativeSearchViewProps> | null =
  requireOptionalNativeModule('NativeSearch')
    ? requireNativeView<NativeSearchViewProps>('NativeSearch')
    : null;
