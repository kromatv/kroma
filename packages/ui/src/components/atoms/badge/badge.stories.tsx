import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Badge, type BadgeTone, badgeVariants } from './badge';

const TONES = badgeVariants.options.tone as BadgeTone[];

export default story({
  name: 'Badge',
  group: 'Feedback',
  docs: 'A metadata pill: video quality, codec, state. Each tone has its own dedicated color so it stays readable on a poster. Text only, **never emoji**.',
  usage: `<Badge tone="4K" />
<Badge tone={qualityTone(quality)}>{quality}</Badge>`,
  guidelines: {
    do: ['Let `qualityTone()` map catalogue strings to a tone; unknowns fall back to neutral.'],
    dont: ["Don't invent new tone colors inline - a tone is a design decision, not a prop."],
  },
  variants: badgeVariants,
  component: Badge,
  scenes: [
    {
      name: 'All tones',
      render: (props) => (
        <Box row wrap gap={12} align="center">
          {TONES.map((tone) => (
            <Badge key={tone} {...props} tone={tone} />
          ))}
        </Box>
      ),
    },
  ],
});
