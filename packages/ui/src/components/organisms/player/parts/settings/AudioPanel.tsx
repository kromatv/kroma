import type { AudioTrack } from '@kroma/core';
import { channelLabel, langName } from '@kroma/core';
import { forwardRef, useImperativeHandle } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/useListFocus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { useT } from '#ui/services/i18n';
import { panelEmpty, panelList } from './panelStyle';
import { SelectRow } from './select-row';

interface AudioPanelProps {
  tracks: AudioTrack[];
  current: number;
  onSelect: (index: number) => void;
  onBack: () => void;
}

/** Audio-track picker (§5). */
export const AudioPanel = forwardRef<PanelHandle, AudioPanelProps>(function AudioPanel(
  { tracks, current, onSelect, onBack },
  ref,
) {
  const t = useT();
  const pick = (i: number) => {
    const track = tracks[i];
    if (track) {
      onSelect(track.index);
      onBack();
    }
  };
  const focus = useListFocus({ count: tracks.length, onActivate: pick, onBack });
  useImperativeHandle(ref, () => ({ onKey: focus.onKey }), [focus.onKey]);

  if (tracks.length === 0) {
    return <Txt style={panelEmpty}>{t('player.noAudioTracks')}</Txt>;
  }

  return (
    <Box style={panelList}>
      {tracks.map((a, i) => {
        const ch = channelLabel(a.channels);
        const codec = a.codec.toUpperCase();
        return (
          <SelectRow
            key={a.index}
            label={a.title?.trim() || langName(t, a.language) || t('player.langUnknown')}
            sub={ch ? `${codec} · ${ch}` : codec}
            selected={a.index === current}
            focused={focus.index === i}
            onActivate={() => pick(i)}
            onFocus={focus.hover(i)}
          />
        );
      })}
    </Box>
  );
});
