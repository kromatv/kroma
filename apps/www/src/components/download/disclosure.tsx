import { IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export interface DisclosureProps {
  label: string;
  children: ReactNode;
}

/** A quiet fold-out for what most readers do not need: a procedure, a checksum.
 *  Native `<details>`, so it opens before hydration and costs no JS. */
export function Disclosure({ label, children }: Readonly<DisclosureProps>) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-sans text-xs font-medium text-dim transition-colors hover:text-text [&::-webkit-details-marker]:hidden">
        <IconChevronRight
          size={13}
          stroke={2}
          className="transition-transform duration-200 ease-out group-open:rotate-90"
          aria-hidden
        />
        {label}
      </summary>
      <div className="mt-3 border-l border-border pl-4">{children}</div>
    </details>
  );
}
