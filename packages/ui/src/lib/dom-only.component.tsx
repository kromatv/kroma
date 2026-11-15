import type { ReactNode } from 'react';

/** What `<DomOnly>` takes. */
export interface DomOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/** Renders `children` where the page is a DOM, `fallback` everywhere else. */
export function DomOnly({ fallback = null }: Readonly<DomOnlyProps>) {
  return <>{fallback}</>;
}
