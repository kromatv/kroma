import type { Orientation } from '@kroma/spatial-nav';
import type { ReactNode, Ref } from 'react';
import { useNavigatorHost } from './navigator-context';
import { type NodeHandle, type NodeState, SpatialNode } from './spatial-node';

const INERT: NodeState = { active: false };

interface NavigatorNodeProps {
  children: ReactNode | ((state: NodeState) => ReactNode);
  orientation?: Orientation;
  alignInGrid?: boolean;
  /** This node's slot among its siblings. Omitted, it takes the one after the
   *  highest declared so far, so a tile that remounts at the head of a sliding
   *  window keeps its place only if it says where that is. */
  index?: number;
  onActive?: () => void;
  onInactive?: () => void;
  ref?: Ref<NodeHandle>;
}

/**
 * A container: it groups the nodes under it and holds no focus of its own. It
 * has no `onFocus` on purpose, since a container that asks for one becomes a
 * focusable nothing can focus and the remote dies on it. `onActive` is the
 * question it can answer: the focus is somewhere inside me.
 *
 * With no `<NavigatorRoot>` above it, it renders its children and registers
 * nothing, so a screen holding one is still a screen on a phone.
 */
function NavigatorNode({ children, ...node }: Readonly<NavigatorNodeProps>) {
  const host = useNavigatorHost();
  if (!host) return <>{typeof children === 'function' ? children(INERT) : children}</>;
  return <SpatialNode {...node}>{children}</SpatialNode>;
}

export type { NavigatorNodeProps };
export { NavigatorNode };
