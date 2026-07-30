// Native has no `position: fixed` and no clipping ancestor to escape, so the
// portal is the identity component here. The web half is in `portal.web.tsx`.

import type { ReactNode } from 'react';

function Portal({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}

export { Portal };
