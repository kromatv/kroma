import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { SegmentedControl } from '#ui/components/molecules/segmented-control';
import { Select } from '#ui/components/molecules/select';
import { CONTROL, type ControlSize } from '#ui/lib/field-shell';

const LEVELS = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warnings' },
  { value: 'error', label: 'Errors' },
] as const;

const SOURCES = [
  { value: 'all', label: 'Every source' },
  { value: 'server', label: 'kroma_server' },
  { value: 'torrents', label: 'tv.kroma.torrents' },
];

/** The console's own filter row: the three controls that have to agree. */
function Row({ size }: Readonly<{ size: ControlSize }>) {
  const [level, setLevel] = useState<string>('all');
  const [source, setSource] = useState('all');
  return (
    <Box row align="center" gap={12} wrap>
      <SegmentedControl.Root
        size={size}
        label="Level"
        value={level}
        options={LEVELS}
        onValueChange={setLevel}
      />
      <Select.Root label="Source" value={source} onValueChange={setSource}>
        <Select.Trigger size={size} />
        {SOURCES.map((option) => (
          <Select.Item key={option.value} value={option.value}>
            {option.label}
          </Select.Item>
        ))}
      </Select.Root>
      <Field.Root label="Filter the lines" hideLabel size={size} w={240}>
        {/* The console row is a browser page: a real input, not the TV caret form. */}
        <Field.Input icon="search" placeholder="Filter the lines…" physicalKeyboard />
      </Field.Root>
      <Button size={size} variant="glass" icon="refresh" label="Refresh" />
      <IconButton control={size} variant="glass" icon="dots-vertical" label="More" />
    </Box>
  );
}

function Sized({ size }: Readonly<{ size: ControlSize }>) {
  const m = CONTROL[size];
  return (
    <Box gap={10}>
      <Text variant="overline" color="textDim">
        {`${size} · corner ${m.radius} · pad ${m.px}/${m.py} · line ${m.line}`}
      </Text>
      <Row size={size} />
    </Box>
  );
}

export default story({
  name: 'Controls',
  group: 'Foundations',
  docs: 'Every input wears ONE well: the same corner, edge, fill, padding and content line, from the single table in `lib/field-shell`. That is what lets a segmented control, a select and a text entry sit on one filter row and read as one family rather than three components that happen to be adjacent. A control that needs a compound shape (a search box with a glyph, an entry with a button glued on) derives from the same numbers instead of inventing its own.',
  usage: `// The app states its density once at startup...
setEntryDefaults({ physicalKeyboard: true, size: 'sm' });

// ...and every control follows, or says so itself.
<SegmentedControl.Root label="Level" value={level} options={LEVELS} onValueChange={setLevel} />

<Select.Root label="Source" value={source} onValueChange={setSource}>
  <Select.Trigger />
  <Select.Item value="server">kroma_server</Select.Item>
</Select.Root>

<Field.Root label="Filter" hideLabel>
  <Field.Input icon="search" placeholder="Filter the lines…" />
</Field.Root>`,
  guidelines: {
    do: [
      'Let the shell decide the height: pin a width if you must, never an `h-*`.',
      'Reach for `CONTROL` when a one-off DOM control has to match a kit one.',
    ],
    dont: [
      "Don't hand a control its own radius or padding: the row stops agreeing the moment one is tuned.",
      "Don't mix sizes on one row; a form is `sm` or `md`, not both.",
    ],
  },
  matrix: false,
  width: 'fill',
  component: Row,
  args: { size: 'sm' as ControlSize },
  controls: { size: ['sm', 'md', 'tv'] },
  scenes: [
    {
      name: 'Both sizes',
      docs: 'The console density and the ten-foot one, each internally consistent.',
      example: () => (
        <Box gap={28}>
          <Sized size="sm" />
          <Sized size="md" />
        </Box>
      ),
    },
  ],
});
