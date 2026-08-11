import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Txt } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { SegmentedControl } from '#ui/components/molecules/segmented-control';
import { Select } from '#ui/components/molecules/select';
import { CONTROL, type ControlSize } from '#ui/lib/field-shell';

const LEVELS = [
  { value: 'all', label: 'Tout' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Avertissements' },
  { value: 'error', label: 'Erreurs' },
] as const;

const SOURCES = [
  { value: 'all', label: 'Toutes les sources' },
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
        label="Niveau"
        value={level}
        options={LEVELS}
        onValueChange={setLevel}
      />
      <Select size={size} label="Source" value={source} options={SOURCES} onChange={setSource} />
      <Field
        label="Filtrer les lignes"
        hideLabel
        icon="search"
        placeholder="Filtrer les lignes…"
        size={size}
        // The console row is a browser page: a real input, not the TV caret form.
        entry={{ physicalKeyboard: true }}
        w={240}
      />
      <Button size={size} variant="glass" icon="refresh" label="Rafraîchir" />
      <IconButton control={size} variant="glass" icon="dots-vertical" label="Plus" />
    </Box>
  );
}

function Sized({ size }: Readonly<{ size: ControlSize }>) {
  const m = CONTROL[size];
  return (
    <Box gap={10}>
      <Txt variant="overline" color="textDim">
        {`${size} · corner ${m.radius} · pad ${m.px}/${m.py} · line ${m.line}`}
      </Txt>
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
<SegmentedControl.Root label="Niveau" value={level} options={LEVELS} onValueChange={setLevel} />
<Select label="Source" value={source} options={SOURCES} onChange={setSource} />
<Field label="Filtrer" hideLabel icon="search" placeholder="Filtrer les lignes…" />`,
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
  args: { size: 'sm' as ControlSize },
  controls: { size: ['sm', 'md', 'tv'] },
  render: ({ size }) => <Row size={size} />,
  scenes: [
    {
      name: 'Both sizes',
      docs: 'The console density and the ten-foot one, each internally consistent.',
      render: () => (
        <Box gap={28}>
          <Sized size="sm" />
          <Sized size="md" />
        </Box>
      ),
    },
  ],
});
