import type { ReactNode, Ref } from 'react';
import { Platform, type StyleProp, View, type ViewProps, type ViewStyle } from 'react-native';
import { useNodeHost } from './navigator-context';
import { usePointerDevice } from './pointer-device';
import { type ItemState, type NodeHandle, SpatialNode } from './spatial-node';

const WEB = Platform.OS === 'web';
const ACTIVATE = [{ name: 'activate' }] as const;
const SELECTED = { selected: true };
const UNSELECTED = { selected: false };

interface PointerProps {
  onMouseEnter?: () => void;
  onClick?: () => void;
}

interface NavigatorItemProps {
  children: ReactNode | ((state: ItemState) => ReactNode);
  /** This item's slot among its siblings, the same as a node's. */
  index?: number;
  onSelect?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Spread onto the inner view, after everything this component puts there,
   *  so a caller's own role, label or handlers win. */
  viewProps?: ViewProps & PointerProps;
  ref?: Ref<NodeHandle>;
}

/**
 * The one thing that takes the focus: a node the navigator can land on, and the
 * view it draws. Throws with no `<NavigatorRoot>` above it, because a control
 * that quietly failed to register is one a remote can never reach.
 */
function NavigatorItem({
  children,
  index,
  onSelect,
  onFocus,
  onBlur,
  style,
  viewProps,
  ref,
}: Readonly<NavigatorItemProps>) {
  return (
    <SpatialNode
      focusable
      index={index}
      onSelect={onSelect}
      onFocus={onFocus}
      onBlur={onBlur}
      ref={ref}
    >
      {(state) => (
        <ItemView state={state} style={style} viewProps={viewProps} onSelect={onSelect}>
          {children}
        </ItemView>
      )}
    </SpatialNode>
  );
}

interface ItemViewProps {
  children: NavigatorItemProps['children'];
  state: ItemState;
  style: StyleProp<ViewStyle>;
  viewProps: NavigatorItemProps['viewProps'];
  onSelect: (() => void) | undefined;
}

function ItemView({ children, state, style, viewProps, onSelect }: Readonly<ItemViewProps>) {
  const { host, parentId: id } = useNodeHost();
  const device = usePointerDevice();

  // The navigator's focus is not the platform's, so a screen reader activating
  // an item the ring is not on has to move the ring before it acts.
  const activate = () => {
    if (host.navigator.focusedId === id) onSelect?.();
    else host.requestFocus(id);
  };

  const pointer: PointerProps | null = WEB
    ? {
        onMouseEnter: () => {
          viewProps?.onMouseEnter?.();
          if (device.current === 'pointer') host.requestFocus(id);
        },
        onClick: () => onSelect?.(),
      }
    : null;

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityActions={ACTIVATE}
      onAccessibilityAction={activate}
      accessibilityState={state.focused ? SELECTED : UNSELECTED}
      style={style}
      {...viewProps}
      {...pointer}
    >
      {typeof children === 'function' ? children(state) : children}
    </View>
  );
}

export type { NavigatorItemProps };
export { NavigatorItem };
