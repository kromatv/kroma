import { createContext, type ReactNode, useContext } from 'react';
import type { ChangeDetails, ControlOf, ReasonOf } from '#ui/lib/control';
import { partContext } from '#ui/lib/part-context';
import type { ResolvedPresentation } from '#ui/lib/surface-presentation.hook';
import type { tagFieldControl } from './tag-field-control';
import type { TagMetrics } from './tag-field-metrics';

/** Why a name was added or taken out, the query moved or the list opened or
 *  closed: an action (`type`, `add`, `remove`), `picked` for a dialog closing on
 *  a pick, `outside`, `escape`, `back` (the remote's Back button), `trigger`, or
 *  `set` for a setter called without a reason. */
type TagFieldReason = ReasonOf<typeof tagFieldControl>;

type TagFieldDetails = ChangeDetails<TagFieldReason>;

type TagFieldControl = ControlOf<typeof tagFieldControl>;

interface TagFieldState {
  label: string;
  query: string;
  metrics: TagMetrics;
  presentation: ResolvedPresentation;
  disabled: boolean;
  faces: ReadonlyMap<string, ReactNode>;
  pick: (name: string, face: ReactNode) => void;
  remove: (name: string) => void;
}

const [TagFieldContext, useTagField] = partContext<TagFieldState>('TagField.Root');

interface TagFieldRowState {
  nativeID?: string;
  active: boolean;
  keyed: boolean;
  autoFocus?: boolean;
  onHoverIn?: () => void;
  onPicked: () => void;
  onLayout?: (y: number, height: number) => void;
}

const IDLE_ROW: TagFieldRowState = { active: false, keyed: false, onPicked: () => undefined };

const TagFieldRowContext = createContext<TagFieldRowState>(IDLE_ROW);

function useTagFieldRow(): TagFieldRowState {
  return useContext(TagFieldRowContext);
}

interface MediaPlace {
  name: string;
  size: number;
}

const MediaPlaceContext = createContext<MediaPlace>({ name: '', size: 20 });

function useMediaPlace(): MediaPlace {
  return useContext(MediaPlaceContext);
}

export type {
  MediaPlace,
  TagFieldControl,
  TagFieldDetails,
  TagFieldReason,
  TagFieldRowState,
  TagFieldState,
};
export {
  IDLE_ROW,
  MediaPlaceContext,
  TagFieldContext,
  TagFieldRowContext,
  useMediaPlace,
  useTagField,
  useTagFieldRow,
};
