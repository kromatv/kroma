import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { ExpandableText } from './expandable-text';

const SYNOPSIS =
  'A blade runner must pursue and terminate four replicants who stole a ship in space and have returned to Earth to find their creator. In the neon murk of a Los Angeles that never sees daylight, the line between hunter and hunted thins with every retirement, and what begins as a job ends as a question about what a life is worth - and who gets to decide. More lives than his own hang on the answer, which is exactly why nobody will say it aloud.';

export default story({
  name: 'ExpandableText',
  group: 'Foundations',
  docs: 'The collapsed paragraph every synopsis wants: clamped to a few lines with a "more" affordance, expanding in place on a press. The overflow test is measured on a hidden unclamped ghost, because a clamped Text only ever reports the clamped line count - and that same pair of measurements is what the growth animates BETWEEN, so the paragraph opens and closes at speed rather than teleporting the rest of the page. `moreLabel` is a prop - the kit knows no app\'s i18n - and text that fits its clamp shows no affordance at all.',
  usage: `<ExpandableText lines={3} moreLabel={t('content.moreInfo')}>
  {synopsis}
</ExpandableText>`,
  guidelines: {
    do: [
      'Pass the localized affordance text - it renders as `… {moreLabel}`.',
      'Keep it to prose. A clamped list or table is a layout problem, not a paragraph.',
    ],
    dont: [
      "Don't use it on a 10-foot screen: a D-pad synopsis wants its own view, not a growing paragraph under the focus.",
      'Don\'t turn the growth off to "keep it snappy" - it is 200ms, and it is what tells a reader the page moved rather than reloaded.',
    ],
  },
  matrix: false,
  width: { min: 280, max: 560 },
  args: { lines: 3, animate: true },
  controls: { lines: { min: 1, max: 8, step: 1 } },
  render: ({ lines, animate }) => (
    <Box maxW={520}>
      <ExpandableText lines={lines} animate={animate} moreLabel="More">
        {SYNOPSIS}
      </ExpandableText>
    </Box>
  ),
  scenes: [
    {
      name: 'Without the growth',
      docs: 'The same press with `animate={false}`: the height jumps, and everything under the paragraph jumps with it. Worth turning off only where the surrounding layout is already animating the same pixels, or in a test that would rather not wait out a transition.',
      args: { animate: false },
    },
    {
      name: 'Nothing to expand',
      docs: 'Text that fits its clamp gets no affordance and no press target: the ghost measures no taller than the visible copy, so there is nothing to reveal.',
      render: () => (
        <Box maxW={520}>
          <ExpandableText lines={3} moreLabel="More">
            Two sentences that fit. There is no more to show, so no affordance is drawn.
          </ExpandableText>
        </Box>
      ),
    },
  ],
});
