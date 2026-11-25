import type { ReactElement, ReactNode } from 'react';
import type { TagFieldControl } from './tag-field-context';
import type { TagFieldItemProps } from './tag-field-item';
import type { TagMetrics } from './tag-field-metrics';
import type { Suggested } from './tag-field-suggestions';

/** What a <TagField.Root> hands the presentation it draws in: the pointer's
 *  well with its anchored list, or the D-pad's stops with their dialog. */
export interface TagFieldSurfaceProps {
  control: TagFieldControl;
  label: string;
  placeholder: string | undefined;
  tags: readonly ReactElement[];
  suggested: Suggested<ReactElement<TagFieldItemProps>>;
  empty: ReactNode;
  loading: boolean;
  freeLabel: string | null;
  full: boolean;
  disabled: boolean;
  invalid: boolean;
  metrics: TagMetrics;
  onFocusChange: (focused: boolean) => void;
  pick: (name: string, face: ReactNode) => void;
}
