import type { Naming } from './naming-props';

/** The props that name a surface: `titleId` and `descriptionId` reference rendered nodes. */
export function namingProps({ title, titleId, descriptionId }: Naming): {
  'aria-labelledby'?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
} {
  return {
    'aria-labelledby': titleId,
    'aria-label': titleId ? undefined : title,
    'aria-describedby': descriptionId,
  };
}
