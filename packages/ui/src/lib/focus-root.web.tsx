// An element here would become the containing block of the absolutely positioned
// screen roots and collapse them, so this groups by node only and drops `style`.

import { NavigatorNode, NavigatorRoot, PointerDeviceProvider } from '@kroma/spatial-nav/react';
import type { FocusRootProps } from './focus-root';

export type { FocusRootProps };

export function FocusRoot({ children, active = true, onEdge }: Readonly<FocusRootProps>) {
  // The navigator boots in remote-keys mode; only the pointer-device provider
  // flips it to pointer mode on the first mousemove, which a webOS Magic Remote
  // needs as much as a browser does.
  return (
    <PointerDeviceProvider>
      <NavigatorRoot active={active} onEdge={onEdge}>
        <NavigatorNode orientation="vertical">{children}</NavigatorNode>
      </NavigatorRoot>
    </PointerDeviceProvider>
  );
}
