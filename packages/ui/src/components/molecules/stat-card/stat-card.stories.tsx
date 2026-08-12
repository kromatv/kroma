import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Progress } from '#ui/components/atoms/progress';
import { StatCard } from './stat-card';

export default story({
  name: 'StatCard',
  group: 'Feedback',
  docs: "One number that matters, on a card: the dashboard's active sessions, a module's disk usage, a queue depth. Label above, display-size value, an optional `unit` at the baseline. The value keeps the text colour unless the number has a hue of its own - a red CPU, a green success rate - stated through `color`. The same `Label` / `Value` pair as `DataField`, raised onto a `Surface`.",
  usage: `<StatCard.Root>
  <StatCard.Label>Sessions</StatCard.Label>
  <StatCard.Value>4</StatCard.Value>
</StatCard.Root>

<StatCard.Root>
  <StatCard.Label>Stockage</StatCard.Label>
  <StatCard.Value unit="To" color="accent">1,2</StatCard.Value>
  <Progress value={0.62} />
</StatCard.Root>`,
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
      <StatCard.Root w={180}>
        <StatCard.Label>{label}</StatCard.Label>
        <StatCard.Value unit={unit || undefined} color={color}>
          {value}
        </StatCard.Value>
      </StatCard.Root>
      <StatCard.Root w={180}>
        <StatCard.Label>Storage</StatCard.Label>
        <StatCard.Value unit="To">1,2</StatCard.Value>
      </StatCard.Root>
      <StatCard.Root w={180}>
        <StatCard.Label>CPU</StatCard.Label>
        <StatCard.Value unit="%" color="danger">
          82
        </StatCard.Value>
      </StatCard.Root>
    </Box>
  ),
  scenes: [
    {
      name: 'A number carrying something under it',
      docs: 'The card is a column, so a bar under the value is one more child of it.',
      example: () => (
        <StatCard.Root w={260}>
          <StatCard.Label>Stockage</StatCard.Label>
          <StatCard.Value unit="To" color="accent">
            1,2
          </StatCard.Value>
          <Progress value={0.62} />
        </StatCard.Root>
      ),
    },
  ],
});
