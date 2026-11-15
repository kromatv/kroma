import type { ReactNode } from 'react';

/** Native styles resolve through context, which a portal keeps: nothing to carry. */
export function ScopeCarrier({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
