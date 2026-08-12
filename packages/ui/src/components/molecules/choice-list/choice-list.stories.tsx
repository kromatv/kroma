import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Badge } from '#ui/components/atoms/badge';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import { ChoiceList } from './choice-list';

const QUALITIES = [
  { value: 'original', label: 'Original', hint: 'Le fichier tel quel, sans transcodage' },
  { value: '1080p', label: '1080p', hint: 'Jusqu’à 8 Mb/s' },
  { value: '720p', label: '720p', hint: 'Jusqu’à 4 Mb/s' },
];

const LIBRARIES = [
  { value: 'films', label: 'Films' },
  { value: 'series', label: 'Séries' },
  { value: 'concerts', label: 'Concerts', hint: 'Analyse en cours' },
];

function Single() {
  const [quality, setQuality] = useState<string | null>('original');
  return (
    <ChoiceList.Root label="Qualité" value={quality} onValueChange={setQuality}>
      {QUALITIES.map((q) => (
        <ChoiceList.Item key={q.value} value={q.value}>
          <ChoiceList.Label>{q.label}</ChoiceList.Label>
          <ChoiceList.Hint>{q.hint}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

function Multiple() {
  const [picked, setPicked] = useState<string[]>(['films']);
  return (
    <ChoiceList.Root mode="multiple" label="Bibliothèques" value={picked} onValueChange={setPicked}>
      {LIBRARIES.map((lib) => (
        <ChoiceList.Item key={lib.value} value={lib.value}>
          <ChoiceList.Label>{lib.label}</ChoiceList.Label>
          {lib.hint ? <ChoiceList.Hint>{lib.hint}</ChoiceList.Hint> : null}
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

function WithActions() {
  const [picked, setPicked] = useState<string[]>(['films']);
  return (
    <ChoiceList.Root mode="multiple" label="Bibliothèques" value={picked} onValueChange={setPicked}>
      {LIBRARIES.map((lib) => (
        <ChoiceList.Item
          key={lib.value}
          value={lib.value}
          actions={
            <IconButton
              variant="ghost"
              size={32}
              glyph={16}
              icon="trash"
              label={`Retirer ${lib.label}`}
            />
          }
        >
          <ChoiceList.Label>{lib.label}</ChoiceList.Label>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

/** A row the plain label-and-hint column could not describe. */
function Composed() {
  const [picked, setPicked] = useState<string[]>(['films']);
  return (
    <ChoiceList.Root mode="multiple" label="Bibliothèques" value={picked} onValueChange={setPicked}>
      {LIBRARIES.map((lib) => (
        <ChoiceList.Item key={lib.value} value={lib.value}>
          <Box row align="center" gap={8}>
            <ChoiceList.Label>{lib.label}</ChoiceList.Label>
            {lib.hint ? <Badge tone="warning">en cours</Badge> : null}
          </Box>
          <ChoiceList.Hint>{lib.hint ?? '128 titres · 1,2 To'}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

export default story({
  name: 'ChoiceList',
  group: 'Input',
  docs: "A list whose rows ARE the control: pick one (`single`, radios) or pick several (`multiple`, checkboxes). Composed rather than configured, in Radix's shape: **Root** owns the value and the group semantics, **Item** reads them through context, and **Indicator / Label / Hint** are the row's faces, always written out. The whole row is the target, so there is one D-pad stop per row and a pointer hit area the size of the thing a reader is aiming at; the row carries `radio`/`checkbox` with its state, inside a named `radiogroup` (single) or group (multiple). Rows can carry their own `actions`, which stay their own controls.",
  usage: `<ChoiceList.Root label="Qualité" value={quality} onValueChange={setQuality}>
  <ChoiceList.Item value="original">
    <ChoiceList.Label>Original</ChoiceList.Label>
    <ChoiceList.Hint>Sans transcodage</ChoiceList.Hint>
  </ChoiceList.Item>
  <ChoiceList.Item value="1080p">
    <ChoiceList.Label>1080p</ChoiceList.Label>
    <ChoiceList.Hint>Jusqu'à 8 Mb/s</ChoiceList.Hint>
  </ChoiceList.Item>
</ChoiceList.Root>

// The row takes whatever arrangement it needs:
<ChoiceList.Item value={lib.value}>
  <Box row align="center" gap={8}>
    <ChoiceList.Label>{lib.label}</ChoiceList.Label>
    <Badge tone="warning">en cours</Badge>
  </Box>
  <ChoiceList.Hint>128 titres · 1,2 To</ChoiceList.Hint>
</ChoiceList.Item>`,
  guidelines: {
    do: [
      "Name the group: Root's `label` is what a screen reader announces before the first row.",
      "Write the `<ChoiceList.Label>` first: its plain text is the row's accessible name.",
      'Put row-level verbs in `actions`; they are separate controls, not part of the choice.',
    ],
    dont: [
      "Don't use it for two or three bare options - that is a <SegmentedControl>.",
      "Don't nest a pressable inside the label: the row already presses.",
    ],
  },
  matrix: false,
  width: 480,
  render: () => <Single />,
  scenes: [
    {
      name: 'Pick several',
      docs: 'Checkbox rows, rows carrying their own delete action, and a row composed from the named parts.',
      example: () => (
        <Box gap={28}>
          <Box gap={10}>
            <Text variant="overline" color="textDim">
              multiple
            </Text>
            <Multiple />
          </Box>
          <Box gap={10}>
            <Text variant="overline" color="textDim">
              with row actions
            </Text>
            <WithActions />
          </Box>
          <Box gap={10}>
            <Text variant="overline" color="textDim">
              composed
            </Text>
            <Composed />
          </Box>
        </Box>
      ),
    },
  ],
});
