import type { MessageKey } from '@kromatv/i18n';
import type { SettingsGroup } from '#tv/app/settings/groups';
import type { RowIcon } from '#tv/app/settings/items';

/** An action of the left pane: it runs on OK, and the right pane says what it does. */
export interface ActionPane {
  kind: 'action';
  id: string;
  icon: RowIcon;
  label: MessageKey;
  hint?: MessageKey;
  description: MessageKey;
  available?: () => boolean;
  run: () => void;
}

/** One row of the settings screen's left pane. */
export type SettingsPane = { kind: 'group'; group: SettingsGroup } | ActionPane;

export function paneId(pane: SettingsPane): string {
  return pane.kind === 'group' ? pane.group.id : pane.id;
}
