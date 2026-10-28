import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Ground } from '#ui/components/atoms/ground';

import { volumeStep } from '#ui/components/organisms/player/lib/fmt';

import { chromeMetrics, GUTTER } from '#ui/components/organisms/player/lib/metrics';

import type { ControlId } from '#ui/components/organisms/player/lib/nav';

import { ControlCluster } from './control-cluster';

export const ALL: ControlId[] = [
  'rewind',
  'play',
  'forward',
  'next',
  'volume',
  'subtitles',
  'audio',
  'settings',
  'pip',
  'fullscreen',
];

export interface LiveProps {
  playing: boolean;
  muted: boolean;
  volume: number;
  pipActive: boolean;
  fullscreen: boolean;
}

export function Live({ playing, muted, volume, ...rest }: Readonly<LiveProps>) {
  const [state, setState] = useState({ playing, muted, volume });
  const [args, setArgs] = useState({ playing, muted, volume });
  if (args.playing !== playing || args.muted !== muted || args.volume !== volume) {
    const next = { playing, muted, volume };
    setArgs(next);
    setState(next);
  }

  const activate = (id: ControlId) => {
    if (id === 'play') setState((prev) => ({ ...prev, playing: !prev.playing }));
    if (id === 'volume') setState((prev) => ({ ...prev, muted: !prev.muted }));
  };

  const [width, setWidth] = useState(0);
  const metrics = chromeMetrics(ALL, width);

  return (
    <Ground tone="dark" flex>
      <Box
        flex
        justify="flex-end"
        bg="bg"
        px={GUTTER}
        pb={40}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        <ControlCluster
          {...rest}
          playing={state.playing}
          muted={state.muted}
          volume={state.volume}
          metrics={metrics}
          onActivate={activate}
          onFocus={() => {}}
          onBlur={() => {}}
          onVolume={(next) => setState((prev) => ({ ...prev, muted: false, volume: next }))}
          onVolumeNudge={(dir) =>
            setState((prev) => ({ ...prev, muted: false, volume: volumeStep(prev.volume, dir, 2) }))
          }
        />
      </Box>
    </Ground>
  );
}
