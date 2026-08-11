import { Link, type LinkProps } from '@tanstack/react-router';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { localizePath, useLang } from '#site/lib/i18n';

type Variant = 'primary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-xl font-sans font-semibold ' +
  'transition-all duration-200 ease-out focus-visible:outline-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-ink shadow-[var(--glow-play)] hover:bg-accent-hover hover:-translate-y-0.5',
  outline: 'border border-border-strong text-text hover:border-accent hover:text-accent',
  ghost: 'text-muted hover:text-text',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[0.95rem]',
  lg: 'h-13 px-7 text-base',
};

export interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  to?: string;
  href?: string;
}

/** One CTA that renders as a router <Link> for internal paths and a plain <a>
 *  for external URLs and in-page anchors, so a call site never has to pick the
 *  element, only the destination. */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  to,
  href,
}: Readonly<ButtonProps>) {
  const lang = useLang();
  const cls = [base, variants[variant], sizes[size], className].filter(Boolean).join(' ');

  if (to) {
    return (
      <Link to={localizePath(to, lang) as LinkProps['to']} className={cls}>
        {children}
      </Link>
    );
  }

  const external = href?.startsWith('http');
  const extra: AnchorHTMLAttributes<HTMLAnchorElement> = external
    ? { target: '_blank', rel: 'noreferrer noopener' }
    : {};
  return (
    <a href={href} className={cls} {...extra}>
      {children}
    </a>
  );
}
