import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { ExpandableText } from './expandable-text';

const SYNOPSIS =
  'A blade runner must pursue and terminate four replicants who stole a ship in space and have returned to Earth to find their creator. In the neon murk of a Los Angeles that never sees daylight, the line between hunter and hunted thins with every retirement, and what begins as a job ends as a question about what a life is worth - and who gets to decide. More lives than his own hang on the answer, which is exactly why nobody will say it aloud.';

export default story({
  name: 'ExpandableText',
  group: 'Foundations',
  docs: 'The collapsed paragraph every synopsis wants: clamped to a few lines with a "more" affordance, expanding in place on a press. The overflow test is measured on a hidden unclamped ghost, because a clamped Text only ever reports the clamped line count. `moreLabel` is a prop - the kit knows no app\'s i18n - and text that fits its clamp shows no affordance at all.',
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
    ],
  },
  matrix: false,
  width: { min: 280, max: 560 },
  args: { lines: 3 },
  controls: { lines: { min: 1, max: 8, step: 1 } },
  render: ({ lines }) => (
    <Box maxW={520}>
      <ExpandableText lines={lines} moreLabel="More">
        {SYNOPSIS}
      </ExpandableText>
    </Box>
  ),
});
