import { type Ref, useImperativeHandle } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/use-list-focus';
import { audioFilterLabels } from '#ui/components/organisms/player/lib/audio-filter';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import type { AudioFilterMode } from '#ui/components/organisms/player/types';
import { useStyles } from '#ui/core';
import { useT } from '#ui/services/i18n';
import { panel } from './panel-style';
import { SelectRow } from './select-row';

interface AudioFilterPanelProps {
  value: AudioFilterMode;
  onSelect: (mode: AudioFilterMode) => void;
  onBack: () => void;
  ref?: Ref<PanelHandle>;
}

const MODES: AudioFilterMode[] = ['off', 'standard', 'night', 'boost'];

/** Volume-normalizer picker (§7): Off / Standard / Night, with a hint. Only
 * mounted when the controller reports `audioFilterSupported`. */
export function AudioFilterPanel({
  value,
  onSelect,
  onBack,
  ref,
}: Readonly<AudioFilterPanelProps>) {
  const panelScoped = useStyles(panel);

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
      <Box style={panelScoped.panelList}>
        {MODES.map((m, i) => (
          <SelectRow
            key={m}
            index={i}
            label={labels[m]}
            selected={m === value}
            focused={focus.index === i}
            onActivate={pick}
            onFocus={focus.setIndex}
          />
        ))}
      </Box>
      <Text style={panelScoped.panelHint}>{t('player.audioFilterHint')}</Text>
    </Box>
  );
}
