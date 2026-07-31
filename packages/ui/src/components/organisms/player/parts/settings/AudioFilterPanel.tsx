import { forwardRef, useImperativeHandle } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/useListFocus';
import { audioFilterLabels } from '#ui/components/organisms/player/lib/audio-filter';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import type { AudioFilterMode } from '#ui/components/organisms/player/types';
import { useT } from '#ui/services/i18n';
import { panel } from './panelStyle';
import { SelectRow } from './select-row';

interface AudioFilterPanelProps {
  value: AudioFilterMode;
  onSelect: (mode: AudioFilterMode) => void;
  onBack: () => void;
}

const MODES: AudioFilterMode[] = ['off', 'standard', 'night'];

/** Volume-normalizer picker (§7): Off / Standard / Night, with a hint. Only
 * mounted when the controller reports `audioFilterSupported`. */
export const AudioFilterPanel = forwardRef<PanelHandle, AudioFilterPanelProps>(
  function AudioFilterPanel({ value, onSelect, onBack }, ref) {
    const t = useT();
    const labels = audioFilterLabels(t);
    const pick = (i: number) => {
      const m = MODES[i];
      if (m) onSelect(m);
      onBack();
    };
    const focus = useListFocus({ count: MODES.length, onActivate: pick, onBack });
    useImperativeHandle(ref, () => ({ onKey: focus.onKey }), [focus.onKey]);

    return (
      <Box>
        <Box style={panel.panelList}>
          {MODES.map((m, i) => (
            <SelectRow
              key={m}
              label={labels[m]}
              selected={m === value}
              focused={focus.index === i}
              onActivate={() => pick(i)}
              onFocus={focus.hover(i)}
            />
          ))}
        </Box>
        <Txt style={panel.panelHint}>{t('player.audioFilterHint')}</Txt>
      </Box>
    );
  },
);
