import { story } from '@kroma/workbench/story';
import { useEffect, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import type { ControlId } from '../lib/nav';
import { ControlCluster } from './ControlCluster';

const ALL: ControlId[] = [
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

interface LiveProps {
  focused: ControlId;
  playing: boolean;
  muted: boolean;
  volume: number;
  pipActive: boolean;
  fullscreen: boolean;
}

/**
 * The row wired to state, because the three things it does are all callbacks:
 * hover moves the focus ring, pressing play swaps the glyph, and the volume rail
 * is a drag. Handed no-ops, the story could only ever show one frozen frame of
 * a control surface.
 */
function Live({ focused: focusedArg, playing, muted, volume, ...rest }: Readonly<LiveProps>) {
  const [state, setState] = useState({ focused: focusedArg, playing, muted, volume });
  // The controls in the panel are the other way to drive it, so they win.
  useEffect(() => {
    setState({ focused: focusedArg, playing, muted, volume });
  }, [focusedArg, playing, muted, volume]);

  const activate = (id: ControlId) => {
    if (id === 'play') setState((prev) => ({ ...prev, playing: !prev.playing }));
    if (id === 'volume') setState((prev) => ({ ...prev, muted: !prev.muted }));
  };

  return (
    <Box flex justify="flex-end" px={34} pb={40}>
      <ControlCluster
        {...rest}
        controls={ALL}
        focused={state.focused}
        playing={state.playing}
        muted={state.muted}
        volume={state.volume}
        onActivate={activate}
        onFocus={(id) => setState((prev) => ({ ...prev, focused: id }))}
        onVolume={(next) => setState((prev) => ({ ...prev, muted: false, volume: next }))}
      />
    </Box>
  );
}

export default story({
  name: 'PlayerControls',
  group: 'Media',
  docs: 'The transport row. Which controls exist is decided by the player (no `next` without a next episode, no `pip` where the platform has none) and handed in as a list, so this draws whatever it is given rather than knowing about episodes or platforms. One `onActivate` serves a mouse click and a D-pad OK alike, and hover moves focus so a pointer and a remote agree on where they are.',
  usage: `<ControlCluster
  controls={controlsFor({ hasNext, pip, fullscreen })}
  focused={nav.control}
  playing={playing}
  muted={muted}
  volume={volume}
  onActivate={run}
  onFocus={nav.focus}
  onVolume={setVolume}
/>`,
  guidelines: {
    do: [
      'Build `controls` from what the platform and the item actually support.',
      'Share one `onActivate` between pointer and remote: they run the same thing.',
    ],
    dont: ["Don't hide a control by rendering it disabled - leave it out of the list."],
  },
  matrix: false,
  // The row is designed for the 1920 stage: a flex spacer, the centred transport,
  // then the cluster pinned right. Given less than that the fixed-size circles
  // collide - so the story opens in the stage instead of a narrow canvas.
  viewport: 'tv',
  args: {
    focused: 'play' as ControlId,
    playing: true,
    muted: false,
    volume: 0.7,
    pipActive: false,
    fullscreen: false,
  },
  controls: { focused: ALL, volume: { min: 0, max: 1, step: 0.05 } },
  render: (args) => <Live {...args} />,
  scenes: [
    {
      name: 'Paused, muted',
      args: { playing: false, muted: true, volume: 0, focused: 'volume' },
    },
    {
      name: 'On the settings gear',
      args: { focused: 'settings' },
    },
  ],
});
