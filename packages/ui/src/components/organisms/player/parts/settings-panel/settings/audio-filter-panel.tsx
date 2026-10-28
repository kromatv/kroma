import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { audioFilterLabels } from '#ui/components/organisms/player/lib/audio-filter';
import type { AudioFilterMode } from '#ui/components/organisms/player/types';
import { useStyles } from '#ui/core';
import { useT } from '#ui/services/i18n';
import { FocusColumn } from '#ui/lib/focus-scope';
import { panel } from './panel-style';
import { SelectRow } from './select-row';

interface AudioFilterPanelProps {
  value: AudioFilterMode;
  onSelect: (mode: AudioFilterMode) => void;
  onBack: () => void;
}

const MODES: AudioFilterMode[] = ['off', 'standard', 'night', 'boost'];

/** Volume-normalizer picker (§7): Off / Standard / Night, with a hint. Only
 * mounted when the controller reports `audioFilterSupported`. */
export function AudioFilterPanel({ value, onSelect, onBack }: Readonly<AudioFilterPanelProps>) {
  const panelScoped = useStyles(panel);

  const t = useT();
  const labels = audioFilterLabels(t);
  const pick = (i: number) => {
    const m = MODES[i];
    if (m) onSelect(m);
    onBack();
  };

  return (
    <Box>
      <FocusColumn style={panelScoped.panelList}>
        {MODES.map((m, i) => (
          <SelectRow key={m} index={i} label={labels[m]} selected={m === value} onActivate={pick} />
        ))}
      </FocusColumn>
      <Text style={panelScoped.panelHint}>{t('player.audioFilterHint')}</Text>
    </Box>
  );
}
