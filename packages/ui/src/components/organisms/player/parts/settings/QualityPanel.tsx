import { forwardRef, useImperativeHandle } from 'react';
import { Box } from '#ui/components/atoms/box';
import { useListFocus } from '#ui/components/organisms/player/hooks/useListFocus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import type { PlayerQuality } from '#ui/components/organisms/player/types';
import { panel } from './panelStyle';
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
export const QualityPanel = forwardRef<PanelHandle, QualityPanelProps>(function QualityPanel(
  { qualities, current, onSelect, onBack },
  ref,
) {
  const pick = (i: number) => {
    const q = qualities[i];
    if (q) onSelect(q.id);
    onBack();
  };
  const focus = useListFocus({ count: qualities.length, onActivate: pick, onBack });
  useImperativeHandle(ref, () => ({ onKey: focus.onKey }), [focus.onKey]);

  return (
    <Box style={panel.panelList}>
      {qualities.map((q, i) => (
        <SelectRow
          key={q.id}
          label={q.label}
          selected={q.id === current}
          focused={focus.index === i}
          onActivate={() => pick(i)}
          onFocus={focus.hover(i)}
        />
      ))}
    </Box>
  );
});
