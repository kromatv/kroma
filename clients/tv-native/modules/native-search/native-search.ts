// JS face of the local Apple TV search module. Optional like Siri: absent on
// Android TV, where requesting it must return null rather than throw.

import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType, ReactNode } from 'react';
import type { ViewProps } from 'react-native';

/** Which focus engine holds the ring: the television's own field and keyboard,
 * or the navigator drawing over the results. */
export type NativeSearchFocus = 'platform' | 'app';

export interface NativeSearchViewProps extends ViewProps {
  placeholder: string;
  // Pushed in (Siri, a recent search). Typing comes back out through
  // `onChangeText`, so this must not be re-sent on every keystroke.
  text: string;
  onChangeText: (event: { nativeEvent: { text: string } }) => void;
  // The room tvOS left for the results, in points. React only learns it from
  // here: the keyboard's width is the platform's business, not ours.
  onLayoutResults: (event: { nativeEvent: { width: number; height: number } }) => void;
  // Which side should hold the focus. Pushed in the same one way as `text`: the
  // viewer moves it too (down into the results, and the platform's own way back
  // out), and that arrives as `onFocusOwner`.
  focus: NativeSearchFocus;
  // `heading` is the direction the viewer was moving when the focus changed
  // hands, empty when nothing carried it (the first focus, or a move the app
  // asked for itself).
  onFocusOwner: (event: {
    nativeEvent: { owner: NativeSearchFocus; heading: '' | 'up' | 'down' | 'left' | 'right' };
  }) => void;
  children?: ReactNode;
}

/** The native search view, or null on a platform that does not ship it. */
export const NativeSearchView: ComponentType<NativeSearchViewProps> | null =
  requireOptionalNativeModule('NativeSearch')
    ? requireNativeView<NativeSearchViewProps>('NativeSearch')
    : null;
