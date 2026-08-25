// <If>: the kit's conditional, so a tree spells "this only when …" as part of
// its markup instead of a `cond ? … : null`. Pure and hook-free: one component
// on the web, on Apple TV and on Android TV, and nothing for the React Compiler
// to trip on.

import type { ReactNode } from 'react';

export interface IfProps {
  /** Render `children` when truthy, otherwise `fallback`. */
  condition: unknown;
  /** Rendered when `condition` is falsy. Defaults to nothing. */
  fallback?: ReactNode;
  children: ReactNode;
}

export function If({ condition, fallback = null, children }: Readonly<IfProps>): ReactNode {
  return condition ? children : fallback;
}
