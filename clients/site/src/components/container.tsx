import type { ReactNode } from 'react';

export interface ContainerProps {
  children: ReactNode;
  className?: string;
  size?: 'default' | 'prose';
}

/** The page's horizontal frame: a centred column with the fluid side gutter the
 *  app uses (`--gutter-web`, 16px on a phone → 56px on desktop). */
export function Container({ children, className, size = 'default' }: Readonly<ContainerProps>) {
  const max = size === 'prose' ? 'max-w-[46rem]' : 'max-w-[75rem]';
  return (
    <div
      className={['mx-auto w-full', max, className].filter(Boolean).join(' ')}
      style={{ paddingInline: 'var(--gutter-web)' }}
    >
      {children}
    </div>
  );
}
