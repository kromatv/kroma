import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Ground } from '#ui/components/atoms/ground';

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
  focused: ControlId;
  playing: boolean;
  muted: boolean;
  volume: number;
  pipActive: boolean;
  fullscreen: boolean;
}

export function Live({
  focused: focusedArg,
  playing,
  muted,
  volume,
  ...rest
}: Readonly<LiveProps>) {
  const [state, setState] = useState({ focused: focusedArg, playing, muted, volume });
  const [args, setArgs] = useState({ focused: focusedArg, playing, muted, volume });
  if (
    args.focused !== focusedArg ||
    args.playing !== playing ||
    args.muted !== muted ||
    args.volume !== volume
  ) {
    const next = { focused: focusedArg, playing, muted, volume };
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
          focused={state.focused}
          playing={state.playing}
          muted={state.muted}
          volume={state.volume}
          metrics={metrics}
          onActivate={activate}
          onFocus={(id) => setState((prev) => ({ ...prev, focused: id }))}
          onVolume={(next) => setState((prev) => ({ ...prev, muted: false, volume: next }))}
        />
      </Box>
    </Ground>
  );
}
