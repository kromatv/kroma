// An element here would become the containing block of the absolutely positioned
// screen roots and collapse them, so this groups by node only and drops `style`.

import {
  SpatialNavigationDeviceTypeProvider,
  SpatialNavigationNode,
  SpatialNavigationRoot,
} from 'react-tv-space-navigation';
import type { FocusRootProps } from './focus-root';

export type { FocusRootProps };

export function FocusRoot({ children }: Readonly<FocusRootProps>) {
  // The navigator boots in remote-keys mode; only the device-type provider
  // flips it to pointer mode on the first mousemove, which a webOS Magic Remote
  // needs as much as a browser does.
  return (
    <SpatialNavigationDeviceTypeProvider>
      <SpatialNavigationRoot isActive>
        <SpatialNavigationNode orientation="vertical">{children as never}</SpatialNavigationNode>
      </SpatialNavigationRoot>
    </SpatialNavigationDeviceTypeProvider>
  );
}
