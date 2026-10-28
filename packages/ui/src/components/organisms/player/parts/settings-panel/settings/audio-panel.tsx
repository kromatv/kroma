import { channelLabel, langName } from '@kromatv/core';
import { Text } from '#ui/components/atoms/text';
import { useStyles } from '#ui/core';
import { useT } from '#ui/services/i18n';
import type { PlayerAudioTrack } from '../../../media-types';
import { FocusColumn } from '#ui/lib/focus-scope';
import { panel } from './panel-style';
import { SelectRow } from './select-row';

interface AudioPanelProps {
  tracks: PlayerAudioTrack[];
  current: number;
  onSelect: (index: number) => void;
  onBack: () => void;
}

/** Audio-track picker (§5). */
export function AudioPanel({ tracks, current, onSelect, onBack }: Readonly<AudioPanelProps>) {
  const panelScoped = useStyles(panel);

  const t = useT();
  const pick = (i: number) => {
    const track = tracks[i];
    if (track) {
      onSelect(track.index);
      onBack();
    }
  };

  if (tracks.length === 0) {
    return <Text style={panelScoped.panelEmpty}>{t('player.noAudioTracks')}</Text>;
  }

  return (
    <FocusColumn style={panelScoped.panelList}>
      {tracks.map((a, i) => {
        const ch = channelLabel(a.channels);
        const codec = a.codec.toUpperCase();
        return (
          <SelectRow
            key={a.index}
            index={i}
            label={a.title?.trim() || langName(t, a.language) || t('player.langUnknown')}
            sub={ch ? `${codec} · ${ch}` : codec}
            selected={a.index === current}
            onActivate={pick}
          />
        );
      })}
    </FocusColumn>
  );
}
