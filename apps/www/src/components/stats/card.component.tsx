import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Off for a card whose children draw their own edges, like a divided panel. */
  padded?: boolean;
}

export function Card({ children, className, padded = true }: Readonly<CardProps>) {
  return (
    <div
      className={[
        'surface-hairline rounded-2xl border border-border bg-surface-1/70',
        padded ? 'p-5 sm:p-6' : 'overflow-hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
