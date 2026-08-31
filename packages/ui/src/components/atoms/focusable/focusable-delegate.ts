import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import type { AnySv } from '#ui/core';
import type { FocusableProps, FocusState, HostElement } from './focusable-types';

function hostOf(children: ReactNode): HostElement {
  const child = Children.only(children);
  if (!isValidElement(child)) throw new Error('asChild needs exactly one element child');
  return child as HostElement;
}

function hostFor<R extends AnySv>(
  children: FocusableProps<R>['children'],
  state: FocusState<R>,
): HostElement {
  return hostOf(typeof children === 'function' ? children(state) : children);
}

function contentFor<R extends AnySv>(
  asChild: boolean,
  children: FocusableProps<R>['children'],
): FocusableProps<R>['children'] {
  if (!asChild) return children;
  return (state) => hostFor(children, state).props.children;
}

/**
 * A control's `asChild` children, split into the element it hands its host to
 * and the content that fills it.
 */
type Delegate =
  | {
      host: null;
      content: ReactNode;
      wrap: (face: ReactNode) => ReactNode;
    }
  | {
      host: HostElement;
      content: ReactNode;
      wrap: (face: ReactNode) => HostElement;
    };

function delegateOf(asChild: boolean | undefined, children: ReactNode): Delegate {
  if (asChild !== true) return { host: null, content: children, wrap: (face) => face };
  const host = hostOf(children);
  return {
    host,
    content: host.props.children,
    wrap: (face) => cloneElement(host, { children: face }),
  };
}

export type { Delegate };
export { contentFor, delegateOf, hostFor };
