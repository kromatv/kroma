import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { StatCard } from './stat-card';

export default story({
  name: 'StatCard',
  group: 'Feedback',
  docs: "One number that matters, on a card: the dashboard's active sessions, a module's disk usage, a queue depth. Label above, display-size value, an optional `unit` at the baseline. The value keeps the text colour unless the number has a hue of its own - a red CPU, a green success rate - stated through `color`.",
  usage: `<StatCard label="Sessions" value={4} />
<StatCard label="CPU" value="82" unit="%" color="danger" />`,
  guidelines: {
    do: [
      'Keep the label a noun ("Storage", "Sessions") - the value is the sentence.',
      'Use `color` only when the number itself carries state; a wall of tinted stats reads as noise.',
    ],
    dont: ["Don't put prose in `value`; a StatCard that needs a paragraph is a Section."],
  },
  matrix: false,
  args: { label: 'Sessions', value: '4', unit: '', color: 'text' },
  controls: {
    label: 'text',
    value: 'text',
    unit: 'text',
    color: ['text', 'accent', 'success', 'danger', 'info'],
  },
  render: ({ label, value, unit, color }) => (
    <Box row gap={16} wrap>
      <StatCard label={label} value={value} unit={unit || undefined} color={color} w={180} />
      <StatCard label="Storage" value="1,2" unit="To" w={180} />
      <StatCard label="CPU" value="82" unit="%" color="danger" w={180} />
    </Box>
  ),
});
