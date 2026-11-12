import { Link, type LinkProps } from '@tanstack/react-router';
import type { AnchorHTMLAttributes } from 'react';

/** A guide's link: a route of the site through the router, which adds the
 *  reader's locale, and anything else as a plain link, opened in a new tab
 *  when it leaves the site. */
export function DocAnchor({
  href = '',
  children,
  ...rest
}: Readonly<AnchorHTMLAttributes<HTMLAnchorElement>>) {
  if (href.startsWith('/')) {
    const [to = '/', hash] = href.split('#');
    return (
      <Link to={to as LinkProps['to']} hash={hash} className={rest.className}>
        {children}
      </Link>
    );
  }
  if (href.startsWith('#')) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
      {children}
    </a>
  );
}
