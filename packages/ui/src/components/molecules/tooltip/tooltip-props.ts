import type { ReactNode } from 'react';

/** What `<Tooltip>` takes. */
export interface TooltipProps {
  /** Already translated. */
  label: string;
  children: ReactNode;
}
