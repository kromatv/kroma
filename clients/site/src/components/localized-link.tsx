import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export interface LProps {
  /** A canonical, UNLOCALIZED path, e.g. `/download`. */
  to: string;
  className?: string;
  /** Class applied when this link matches the active route. */
  activeClassName?: string;
  children: ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}

/**
 * An internal link.
 *
 * It used to add the locale prefix itself. It no longer does, and must not: the
 * router localizes every href it generates, through the `output` rewrite in
 * router.tsx, so a second prefix here produced `/fr/fr/download`. Call sites still
 * write the canonical path - that half of the contract is unchanged - the prefix
 * is just applied one layer down now.
 *
 * What is left is the `activeClassName` shorthand over TanStack's `activeProps`,
 * which is the only reason this is still a component rather than a plain `Link`.
 */
export function L({
  to,
  className,
  activeClassName,
  children,
  onClick,
  ...rest
}: Readonly<LProps>) {
  return (
    <Link
      to={to as LinkProps['to']}
      className={className}
      onClick={onClick}
      activeProps={activeClassName ? { className: activeClassName } : undefined}
      {...rest}
    >
      {children}
    </Link>
  );
}
