import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export interface LProps {
  to: string;
  className?: string;
  activeClassName?: string;
  children: ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}

/**
 * An internal link. It must NOT add the locale prefix: the router localizes
 * every href it generates through the `output` rewrite in router.tsx, and a
 * second prefix here yields `/fr/fr/download`.
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
