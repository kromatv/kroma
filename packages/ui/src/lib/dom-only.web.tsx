import type { DomOnlyProps } from './dom-only';

/** Renders `children` where the page is a DOM, `fallback` everywhere else. */
export function DomOnly({ children }: Readonly<DomOnlyProps>) {
  return <>{children}</>;
}
