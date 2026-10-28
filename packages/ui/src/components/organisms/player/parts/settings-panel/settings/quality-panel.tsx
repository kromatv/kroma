import type { PlayerQuality } from '#ui/components/organisms/player/types';
import { useStyles } from '#ui/core';
import { FocusColumn } from '#ui/lib/focus-scope';
import { panel } from './panel-style';
import { SelectRow } from './select-row';

interface QualityPanelProps {
  qualities: PlayerQuality[];
  current: string;
  onSelect: (id: string) => void;
  /** Return to the settings menu (Back, or after a pick). */
  onBack: () => void;
}

/**
 * Quality picker (§5). The server is remux-only, so this reflects the honest
 * source ("Auto · <source>") rather than a fake ladder. Picking a quality selects
 * it and returns to the menu.
 */
export function QualityPanel({
  qualities,
  current,
  onSelect,
  onBack,
}: Readonly<QualityPanelProps>) {
  const panelScoped = useStyles(panel);

  const pick = (i: number) => {
    const q = qualities[i];
    if (q) onSelect(q.id);
    onBack();
  };

  return (
    <FocusColumn style={panelScoped.panelList}>
      {qualities.map((q, i) => (
        <SelectRow
          key={q.id}
          index={i}
          label={q.label}
          sub={q.note}
          selected={q.id === current}
          onActivate={pick}
        />
      ))}
    </FocusColumn>
  );
}
