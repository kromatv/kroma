import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import type { ControlId } from '../lib/nav';
import { DEFAULT_SUB_APPEARANCE } from '../lib/subtitle-appearance';
import { fakeController } from '../player.fixture';
import { SettingsPanel } from './SettingsPanel';
import type { SubtitleGenBundle } from './settings/gen';

/** No server behind the workbench, so nothing can be generated: `canCreate` off
 *  is the honest state, and the wizard hides itself rather than offering a button
 *  that cannot work. The `Generating` scene below turns it on. */
const NO_GEN: SubtitleGenBundle = {
  canCreate: false,
  caps: null,
  pending: [],
  onCancel: () => {},
  onDelete: () => {},
  onStart: () => {},
};

/** What `chromeMetrics` hands over at phone width (see ../lib/metrics): the
 *  controls the transport row had no room for. `audio` and `subtitles` are in it
 *  too - the panel ignores those two, because the menu already lists them. */
const NARROW_OVERFLOW: ControlId[] = ['next', 'volume', 'subtitles', 'audio', 'cast', 'pip'];

export default story({
  name: 'PlayerSettings',
  group: 'Player',
  docs: 'Everything you can change without leaving the film: audio track, subtitles and their appearance, speed, quality, the normalizer, and — where the host offers it — reporting a problem. It is a **stack of sub-views** rather than one long list, because a 10-foot menu that scrolls is a menu you lose your place in. Rows appear only when the platform supports them: no engine picker on a TV, no report row unless the host passes `onReport`.',
  usage: `<SettingsPanel
  controller={controller}
  appearance={appearance}
  onAppearance={setAppearance}
  statsOn={statsOn}
  onToggleStats={toggleStats}
  subtitleGen={subtitleGen}
  onReport={reportProblem}
  onClose={close}
/>`,
  guidelines: {
    do: [
      'Let the rows hide themselves: an absent capability should mean an absent row, not a disabled one.',
      'Open straight into a sub-view with `initialView` from the cluster quick-access buttons.',
    ],
    dont: [
      "Don't pass `onReport` on a surface with no reporting flow - the row is conditional for that reason.",
    ],
  },
  matrix: false,
  // The drawer is 56% of the player surface, not a fixed panel, so a range is
  // what actually exercises it: the rows have to hold at both ends of one.
  width: { min: 640, max: 1100 },
  // Right-anchored on a 10-foot surface: on a stage narrower than `min` (a
  // phone) the scroller opens at the EMPTY left half and the drawer is off
  // canvas, so the story opens in the TV frame - seen whole, like the player's
  // other overlays - and `Fit` remains one press away.
  viewport: 'tv',
  args: { statsOn: false as boolean, canReport: true, narrow: false as boolean },
  render: ({ statsOn, canReport, narrow }) => (
    // The drawer is inset to the full height of the surface it slides over, so
    // the frame is the picture's shape with a floor under it - a menu shown 300pt
    // tall would be scrolling for a reason no surface has.
    <Box aspect={16 / 9} minH={560} bg="surface2" radius="lg" overflow="hidden">
      <SettingsPanel
        controller={fakeController()}
        appearance={DEFAULT_SUB_APPEARANCE}
        onAppearance={() => {}}
        statsOn={statsOn}
        onToggleStats={() => {}}
        subtitleGen={NO_GEN}
        onReport={canReport ? async () => {} : undefined}
        overflow={narrow ? NARROW_OVERFLOW : undefined}
        onControl={() => {}}
        onClose={() => {}}
      />
    </Box>
  ),
  scenes: [
    {
      name: 'No reporting',
      docs: 'A surface with its own reporting flow (or none) simply omits the row.',
      args: { canReport: false },
    },
    {
      name: 'Stats on',
      docs: 'The toggle that puts the playback read-out over the film.',
      args: { statsOn: true },
    },
    {
      name: 'Holding a narrow row',
      docs: 'What a phone-width window looks like: the transport could not fit these, so they are here instead, above the settings and under their own eyebrow. `audio` and `subtitles` are shed too but gain no row — the menu already lists them.',
      args: { narrow: true },
    },
  ],
});
