import type { MessageKey } from '@kromatv/i18n';
import type { FocusHandle } from '@kromatv/ui/kit';
import type { ComponentType, RefObject } from 'react';
import type { SettingsGroup } from '#tv/app/settings/groups';
import type { RowIcon } from '#tv/app/settings/items';

interface PaneFace {
  id: string;
  icon: RowIcon;
  label: MessageKey;
  hint?: MessageKey;
  available?: () => boolean;
}

/** An action of the left pane: it runs on OK, and the right pane says what it does. */
export interface ActionPane extends PaneFace {
  kind: 'action';
  description: MessageKey;
  run: () => void;
}

/** A row whose right pane is its own content, entered with Right or OK like a group's. */
export interface PanelPane extends PaneFace {
  kind: 'panel';
  Panel: ComponentType<{ entry: RefObject<FocusHandle | null> }>;
}

/** One row of the settings screen's left pane. */
export type SettingsPane = { kind: 'group'; group: SettingsGroup } | ActionPane | PanelPane;

export function paneId(pane: SettingsPane): string {
  return pane.kind === 'group' ? pane.group.id : pane.id;
}
