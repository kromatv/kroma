// <Tooltip>: a short label that appears over its child on hover or keyboard
// focus. A pointer-only pattern: on a television there is no hover and the
// ten-foot design says what things are in place, so the native targets render
// the child untouched (the label still reaches assistive tech as the child's
// own accessibilityLabel, which callers keep setting). The web half is in
// ./tooltip.web.

import type { ReactNode } from 'react';

interface TooltipProps {
  /** Already translated. */
  label: string;
  children: ReactNode;
}

function Tooltip({ children }: Readonly<TooltipProps>) {
  return <>{children}</>;
}

export type { TooltipProps };
export { Tooltip };
