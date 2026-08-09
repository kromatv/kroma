import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { PerfHud } from './perf-hud';

export default story({
  name: 'PerfHud',
  group: 'Feedback',
  docs: 'The on-device frame read-out, turned on in the device settings. A television is the only place these numbers mean anything and the hardest place to attach a profiler — Samsung blocks the log, the simulator lies about the CPU, and a laptop browser is ten times too fast — so the app carries its own. Read it in order: **RESPONSE** (press-to-focus; over ~120ms the remote feels heavy whatever the frame rate says), **WORST** (one 200ms frame is a visible jolt even at a good average), then **JANK**.',
  usage: `<PerfHud enabled={settings.showPerfHud} />`,
  guidelines: {
    do: [
      'Judge the remote by `RESPONSE`, not by FPS: a heavy-feeling remote can average 60.',
      'Leave it mounted and disabled - it costs nothing until `enabled` flips.',
    ],
    dont: [
      "Don't ship it enabled: sampling frames on a TV competes with the decode you are measuring.",
      "Don't read the average alone; one bad frame is what a viewer actually notices.",
    ],
  },
  matrix: false,
  // The HUD pins itself to a corner, so what it has to survive is the surface
  // CHANGING size, not one particular size.
  width: { min: 360, max: 720 },
  args: { enabled: true },
  render: ({ enabled }) => (
    // The HUD positions itself absolutely, so the story gives it a corner to sit
    // in rather than letting it escape the canvas. A floor rather than a fixed
    // height: absolute children add none of their own, and the read-out has to
    // have somewhere to land.
    <Box minH={220} bg="surface1" radius="lg" overflow="hidden">
      <Box p={20}>
        <Txt variant="meta" color="textDim">
          {enabled
            ? 'Sampling. The numbers are this machine, not a television.'
            : 'Disabled: nothing is sampled and nothing renders.'}
        </Txt>
      </Box>
      <PerfHud enabled={enabled} />
    </Box>
  ),
});
