import { useT } from '@kromatv/ui';
import { type FocusHandle, ListRow } from '@kromatv/ui/kit';
import type { Ref } from 'react';
import { GroupSummary } from './GroupSummary';
import { type SettingsPane, paneId } from './panes';

interface PaneRowProps {
  pane: SettingsPane;
  active: boolean;
  entry: boolean;
  handle: Ref<FocusHandle>;
  onFocus: (id: string) => void;
  onBlur: () => void;
  onEnter: () => void;
}

/** A left-pane row: a group or a panel previews on the right as it takes focus
 * and is entered on OK, an action runs on OK. */
export function PaneRow({
  pane,
  active,
  entry,
  handle,
  onFocus,
  onBlur,
  onEnter,
}: Readonly<PaneRowProps>) {
  const t = useT();
  const id = paneId(pane);
  const face =
    pane.kind === 'group'
      ? {
          icon: pane.group.icon,
          label: pane.group.label,
          hint: <GroupSummary items={pane.group.summary} />,
          run: onEnter,
        }
      : {
          icon: pane.icon,
          label: pane.label,
          hint: pane.hint && t(pane.hint),
          run: pane.kind === 'panel' ? onEnter : pane.run,
        };
  return (
    <ListRow.Root
      ground="surface"
      size="tv"
      icon={face.icon}
      autoFocus={entry}
      selected={active}
      chevron={pane.kind !== 'action'}
      focusHandle={handle}
      onFocus={() => onFocus(id)}
      onBlur={onBlur}
      onPress={face.run}
    >
      <ListRow.Label>{t(face.label)}</ListRow.Label>
      {face.hint ? <ListRow.Hint lines={1}>{face.hint}</ListRow.Hint> : null}
    </ListRow.Root>
  );
}
