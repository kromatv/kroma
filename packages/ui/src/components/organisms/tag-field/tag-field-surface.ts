import type { ReactElement } from 'react';
import type { SuggestionSurface } from '#ui/components/organisms/suggestions/suggestion-surface';
import type { TagFieldControl } from './tag-field-context';

/** What a <TagField.Root> hands the presentation it draws in: the pointer's
 *  well with its anchored list, or the D-pad's stops with their dialog. */
export interface TagFieldSurfaceProps {
  surface: SuggestionSurface;
  control: TagFieldControl;
  tags: readonly ReactElement[];
  full: boolean;
}
