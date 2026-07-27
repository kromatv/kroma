// The screen ROOT of the navigator on the browser targets: NOT a single element.
//
// The navigation is identical to the native side - same library, same rows, same
// keys (see focus-scope.tsx and focus-remote.web.ts). What differs is the box,
// and it is load-bearing rather than tidiness. Every screen root is absolutely
// positioned (`<Box fill>`), and the page landmark they sit in is deliberately
// layout-neutral with zero height. A wrapper here is `position: relative` by
// default, so it becomes those screens' containing block: they collapse to its
// zero height and their content is not painted at all. That is exactly what
// happened when this file was briefly deleted and the native root - which
// legitimately renders a `flex: 1` view - was used on the web too.
//
// So the screen is grouped by a NODE, which contributes an entry to the
// navigator's tree and no element to the page. `style` is therefore accepted and
// DROPPED: there is no box here to put it on.

import {
  SpatialNavigationDeviceTypeProvider,
  SpatialNavigationNode,
  SpatialNavigationRoot,
} from 'react-tv-space-navigation';
import type { FocusRootProps } from './focus-root';

export type { FocusRootProps };

export function FocusRoot({ children }: Readonly<FocusRootProps>) {
  // The device-type provider is what gives the browser targets a MOUSE: the
  // navigator boots in remote-keys mode and only its provider (which flips to
  // pointer mode on the first mousemove) makes hover move the focus. Without
  // it the amber ring ignores the pointer entirely - it sticks wherever the
  // D-pad left it. A webOS Magic Remote is a pointer too, so this is not just
  // a developer-browser nicety.
  return (
    <SpatialNavigationDeviceTypeProvider>
      <SpatialNavigationRoot isActive>
        <SpatialNavigationNode orientation="vertical">{children as never}</SpatialNavigationNode>
      </SpatialNavigationRoot>
    </SpatialNavigationDeviceTypeProvider>
  );
}
