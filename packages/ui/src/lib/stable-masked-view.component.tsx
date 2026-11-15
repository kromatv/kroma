import MaskedView from '@react-native-masked-view/masked-view';
import type { ReactNode } from 'react';
import {
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

/** A `MaskedView` whose own children never change: one mask root and one content view, neither of which Fabric may flatten. The legacy view under the interop layer indexes its children itself, and a child list Fabric reshaped under it aborts the app. `style` places the view; `contentStyle` lays out what is inside. */
export function StableMaskedView({
  style,
  contentStyle,
  maskElement,
  onLayout,
  children,
}: Readonly<{
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  maskElement: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}>) {
  return (
    <MaskedView
      style={style}
      onLayout={onLayout}
      maskElement={
        <View collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="none">
          {maskElement}
        </View>
      }
    >
      <View collapsable={false} style={contentStyle}>
        {children}
      </View>
    </MaskedView>
  );
}
