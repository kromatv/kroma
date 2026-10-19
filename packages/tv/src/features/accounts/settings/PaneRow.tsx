import { useT } from '@kromatv/ui';
import { ListRow } from '@kromatv/ui/kit';
import { GroupSummary } from './GroupSummary';
import { type SettingsPane, paneId } from './panes';

interface PaneRowProps {
  pane: SettingsPane;
  active: boolean;
  entry: boolean;
  onFocus: (id: string) => void;
}

/** A left-pane row: a group previews its rows on the right as it takes focus,
 * an action runs on OK. */
export function PaneRow({ pane, active, entry, onFocus }: Readonly<PaneRowProps>) {
  const t = useT();
  const id = paneId(pane);
  const face =
    pane.kind === 'group'
      ? {
          icon: pane.group.icon,
          label: pane.group.label,
          hint: <GroupSummary items={pane.group.summary} />,
          run: undefined,
        }
      : { icon: pane.icon, label: pane.label, hint: pane.hint && t(pane.hint), run: pane.run };
  return (
    <ListRow.Root
      ground="surface"
      size="tv"
      icon={face.icon}
      autoFocus={entry}
      selected={active}
      chevron={pane.kind === 'group'}
      onFocus={() => onFocus(id)}
      onPress={face.run}
    >
      <ListRow.Label>{t(face.label)}</ListRow.Label>
      {face.hint ? <ListRow.Hint lines={1}>{face.hint}</ListRow.Hint> : null}
    </ListRow.Root>
  );
}
