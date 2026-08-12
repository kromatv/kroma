import { forwardRef, useImperativeHandle } from 'react';
import { Box } from '#ui/components/atoms/box';
import { useListFocus } from '#ui/components/organisms/player/hooks/use-list-focus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { useT } from '#ui/services/i18n';
import { panel } from './panel-style';
import { SelectRow } from './select-row';

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

interface SpeedPanelProps {
  rate: number;
  onSelect: (rate: number) => void;
  onBack: () => void;
}

/** Playback-speed picker (§5). `1` reads as "Normal"; others as "1.25×". */
export const SpeedPanel = forwardRef<PanelHandle, SpeedPanelProps>(function SpeedPanel(
  { rate, onSelect, onBack },
  ref,
) {
  const t = useT();
  const pick = (i: number) => {
    const r = RATES[i];
    if (r != null) onSelect(r);
    onBack();
  };
  const focus = useListFocus({ count: RATES.length, onActivate: pick, onBack });
  useImperativeHandle(ref, () => ({ onKey: focus.onKey }), [focus.onKey]);

  return (
    <Box style={panel.panelList}>
      {RATES.map((r, i) => (
        <SelectRow
          key={r}
          label={r === 1 ? t('player.normalSpeed') : `${r}×`}
          selected={r === rate}
          focused={focus.index === i}
          onActivate={() => pick(i)}
          onFocus={focus.hover(i)}
        />
      ))}
    </Box>
  );
});
