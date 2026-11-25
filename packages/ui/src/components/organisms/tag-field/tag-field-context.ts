import type { ReactNode } from 'react';
import type { EntryMetrics } from '#ui/components/organisms/suggestions/entry-metrics';
import type { ChangeDetails, ControlOf, ReasonOf } from '#ui/lib/control';
import { partContext } from '#ui/lib/part-context';
import type { ResolvedPresentation } from '#ui/lib/surface-presentation.hook';
import type { tagFieldControl } from './tag-field-control';

/** Why a name was added or taken out, the query moved or the list opened or
 *  closed: an action (`type`, `add`, `remove`), `picked` for a dialog closing on
 *  a pick, `outside`, `escape`, `back` (the remote's Back button), `trigger`, or
 *  `set` for a setter called without a reason. */
type TagFieldReason = ReasonOf<typeof tagFieldControl>;

type TagFieldDetails = ChangeDetails<TagFieldReason>;

type TagFieldControl = ControlOf<typeof tagFieldControl>;

interface TagFieldState {
  metrics: EntryMetrics;
  presentation: ResolvedPresentation;
  disabled: boolean;
  faces: ReadonlyMap<string, ReactNode>;
  remove: (name: string) => void;
}

const [TagFieldContext, useTagField] = partContext<TagFieldState>('TagField.Root');

export type { TagFieldControl, TagFieldDetails, TagFieldReason, TagFieldState };
export { TagFieldContext, useTagField };
