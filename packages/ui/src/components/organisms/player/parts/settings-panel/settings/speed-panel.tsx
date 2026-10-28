import { useStyles } from '#ui/core';
import { useT } from '#ui/services/i18n';
import { FocusColumn } from '#ui/lib/focus-scope';
import { panel } from './panel-style';
import { SelectRow } from './select-row';

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

interface SpeedPanelProps {
  rate: number;
  onSelect: (rate: number) => void;
  onBack: () => void;
}

/** Playback-speed picker (§5). `1` reads as "Normal"; others as "1.25×". */
export function SpeedPanel({ rate, onSelect, onBack }: Readonly<SpeedPanelProps>) {
  const panelScoped = useStyles(panel);

  const t = useT();
  const pick = (i: number) => {
    const r = RATES[i];
    if (r != null) onSelect(r);
    onBack();
  };

  return (
    <FocusColumn style={panelScoped.panelList}>
      {RATES.map((r, i) => (
        <SelectRow
          key={r}
          index={i}
          label={r === 1 ? t('player.normalSpeed') : `${r}×`}
          selected={r === rate}
          onActivate={pick}
        />
      ))}
    </FocusColumn>
  );
}
