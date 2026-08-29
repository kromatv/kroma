import type { Orientation } from '@kroma/spatial-nav';
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useDefaultFocus } from './default-focus';
import { ParentIdContext, useNodeHost } from './navigator-context';

interface NodeState {
  active: boolean;
}

interface ItemState extends NodeState {
  focused: boolean;
}

interface NodeHandle {
  focus: () => void;
}

interface SpatialNodeProps {
  children: ReactNode | ((state: ItemState) => ReactNode);
  focusable?: boolean;
  orientation?: Orientation;
  alignInGrid?: boolean;
  index?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  onSelect?: () => void;
  onActive?: () => void;
  onInactive?: () => void;
  ref?: Ref<NodeHandle>;
}

function SpatialNode({
  children,
  focusable = false,
  orientation = 'vertical',
  alignInGrid = false,
  index,
  onFocus,
  onBlur,
  onSelect,
  onActive,
  onInactive,
  ref,
}: Readonly<SpatialNodeProps>) {
  const { host, parentId } = useNodeHost();
  const id = `${parentId}${useId()}`;
  const wantsFocus = useDefaultFocus();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(false);

  // A registration is immutable, so what it hands the navigator reads the
  // latest props rather than the ones this node mounted with.
  const latest = useRef({ onFocus, onBlur, onSelect, onActive, onInactive, watched: false });
  latest.current = {
    onFocus,
    onBlur,
    onSelect,
    onActive,
    onInactive,
    watched: typeof children === 'function',
  };

  useImperativeHandle(ref, () => ({ focus: () => host.requestFocus(id) }), [host, id]);

  const { navigator } = host;
  useEffect(() => {
    navigator.registerNode(id, {
      parent: parentId,
      focusable,
      orientation,
      alignInGrid,
      index,
      onFocus: () => {
        latest.current.onFocus?.();
        if (latest.current.watched) setFocused(true);
      },
      onBlur: () => {
        latest.current.onBlur?.();
        if (latest.current.watched) setFocused(false);
      },
      onSelect: () => latest.current.onSelect?.(),
      onActive: () => {
        latest.current.onActive?.();
        if (latest.current.watched) setActive(true);
      },
      onInactive: () => {
        latest.current.onInactive?.();
        if (latest.current.watched) setActive(false);
      },
    });
    return () => navigator.unregisterNode(id);
  }, [navigator, id, parentId, focusable, orientation, alignInGrid, index]);

  useEffect(() => {
    if (focusable && wantsFocus) host.claimFocus(id);
  }, [host, id, focusable, wantsFocus]);

  return (
    <ParentIdContext.Provider value={id}>
      {typeof children === 'function' ? children({ focused, active }) : children}
    </ParentIdContext.Provider>
  );
}

export type { ItemState, NodeHandle, NodeState, SpatialNodeProps };
export { SpatialNode };
