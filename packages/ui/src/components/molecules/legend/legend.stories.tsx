import { story } from '@kroma/workbench/story';
import { SERIES_COLORS } from '#ui/core/tokens';
import { Legend } from './legend';

export default story({
  name: 'Legend',
  group: 'Feedback',
  docs: "The key to a chart's colours, or to a board's status dots. It reports and never filters, so no part of it is pressable. The paint is the value the chart was given rather than a palette tone: a canvas cannot resolve a custom property, and a series' hue is assigned by position and never cycled.",
  usage: `<Legend.Root>
  <Legend.Item color={CHART_SERIES.films} label="Films" />
  <Legend.Item color={CHART_SERIES.tv} label="Series" />
</Legend.Root>`,
  guidelines: {
    do: [
      'Take the paint from the same table the chart reads, so the two can never disagree.',
      'Write the entries in the order the series are assigned; a reader learns the mapping once.',
    ],
    dont: [
      "Don't make an entry pressable to toggle a series - that is a set of chips, and the whole row would have to become a control.",
      "Don't run past three series in one chart. Facet instead: the data palette has three slots and no fourth hue separates under CVD.",
    ],
  },
  matrix: false,
  args: { label: 'Films' },
  render: ({ label }) => (
    <Legend.Root>
      <Legend.Item color={SERIES_COLORS[0]} label={label} />
      <Legend.Item color={SERIES_COLORS[1]} label="Series" />
      <Legend.Item color={SERIES_COLORS[2]} label="Musique" />
    </Legend.Root>
  ),
  scenes: [
    {
      name: 'Status board',
      docs: "The other reader: the pipeline console, where the paints are the palette's semantic steps rather than the data one.",
      render: () => (
        <Legend.Root>
          <Legend.Item color="success" label="Termine" />
          <Legend.Item color="accent" label="En cours" />
          <Legend.Item color="danger" label="Echoue" />
        </Legend.Root>
      ),
    },
  ],
});
