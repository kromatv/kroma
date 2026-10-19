import {
  NavigatorItem,
  type NavigatorItemProps,
  type NodeHandle,
} from '@kromatv/spatial-nav/react';
import type { ReactNode, Ref } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import type { splitBoxLayers } from './box-layers';
import { GROUNDED, LIFTED } from './focus-lift';

/** What a navigator node needs to render a control, identical on every target. */
export interface NavigatorItemHostProps {
  entry: Ref<NodeHandle | null>;
  onSelect: () => void;
  onLongSelect: (() => void) | undefined;
  onFocus: () => void;
  onBlur: () => void;
  painted: StyleProp<ViewStyle>[];
  layers: ReturnType<typeof splitBoxLayers> | null;
  viewProps: object;
  pointer: {
    onHoverIn: () => void;
    onHoverOut: () => void;
    onPointerDown: () => void;
    onPointerUp: () => void;
  };
  focused: boolean;
  pressed: boolean;
  render: (focused: boolean, pressed: boolean) => ReactNode;
  face: (focused: boolean, painted: StyleProp<ViewStyle>[]) => ReactNode;
}

type NavigatorStyle = NavigatorItemProps['style'];

/** The face lifts on the browser's single element; natively the lift rides the outer box. */
export const faceLift = (_focused: boolean): boolean => false;

/** A navigator node as two views: the outer box placed and lifted, the painted face inside. */
export function NavigatorItemHost({
  entry,
  face,
  focused,
  layers,
  onBlur,
  onFocus,
  onLongSelect,
  onSelect,
  painted,
  viewProps,
}: Readonly<NavigatorItemHostProps>): ReactNode {
  return (
    <NavigatorItem
      ref={entry}
      onSelect={onSelect}
      onLongSelect={onLongSelect}
      onFocus={onFocus}
      onBlur={onBlur}
      style={StyleSheet.flatten([layers?.box, focused ? LIFTED : GROUNDED]) as NavigatorStyle}
      viewProps={viewProps as NavigatorItemProps['viewProps']}
    >
      {(state) => face(state.focused, painted)}
    </NavigatorItem>
  );
}
