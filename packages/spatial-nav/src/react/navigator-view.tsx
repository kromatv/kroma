import type { Orientation } from '@kroma/spatial-nav';
import type { ReactNode, Ref } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useNavigatorHost } from './navigator-context';
import { NavigatorNode } from './navigator-node';
import type { NodeHandle } from './spatial-node';

interface NavigatorViewProps {
  children: ReactNode;
  direction: Orientation;
  alignInGrid?: boolean;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<NodeHandle>;
}

/**
 * A `<NavigatorNode>` that is also the box its children are laid out in: the
 * axis the navigator walks and the axis the row is drawn on are one prop.
 */
function NavigatorView({
  children,
  direction,
  alignInGrid = false,
  style,
  ref,
}: Readonly<NavigatorViewProps>) {
  const host = useNavigatorHost();
  const box = (
    <View style={[style, direction === 'horizontal' ? axis.row : axis.column]}>{children}</View>
  );
  if (!host) return box;
  return (
    <NavigatorNode orientation={direction} alignInGrid={alignInGrid} ref={ref}>
      {box}
    </NavigatorNode>
  );
}

const axis = StyleSheet.create({
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
});

export type { NavigatorViewProps };
export { NavigatorView };
