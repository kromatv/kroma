import type { ComponentType } from 'react';

/** Structural type for a Tabler icon, so a caller passes the component directly
 *  (`icon={IconKey}`) without every file on this page depending on Tabler's own
 *  exported type. */
export type IconComponent = ComponentType<{
  size?: number | string;
  stroke?: number;
  className?: string;
  'aria-hidden'?: boolean;
}>;
