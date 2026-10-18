import { type ReactNode, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { CheckboxFace } from '#ui/components/atoms/checkbox';
import { Divider } from '#ui/components/atoms/divider';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text } from '#ui/components/atoms/text';
import { styles, useStyles } from '#ui/core';
import type { ControlSize } from '#ui/lib/field-shell';
import { SelectionBar, type SelectionBarPlacement } from './selection-bar';

const TITLES = [
  'Dune : Deuxième partie',
  'Arcane',
  'Severance',
  'Blade Runner 2049',
  'The Bear',
  'Andor',
  'Shōgun',
  'Past Lives',
];

const TOTAL = 1170;

const picked = (count: number) =>
  count === 1 ? '1 titre sélectionné' : `${count.toLocaleString('fr-FR')} titres sélectionnés`;

function TitleRows({
  selected,
  onToggle,
}: Readonly<{ selected: ReadonlySet<string>; onToggle: (title: string) => void }>) {
  const s = useStyles(sDefinition);
  return (
    <Box radius="xl" border="border" bg="surface1" overflow="hidden">
      {TITLES.map((title, at) => (
        <Box key={title}>
          {at > 0 ? <Divider spacing={0} color="tint/4" /> : null}
          <Focusable
            role="checkbox"
            checked={selected.has(title)}
            label={title}
            onPress={() => onToggle(title)}
            ring="focusInset"
            style={s.row}
          >
            <CheckboxFace checked={selected.has(title)} />
            <Text variant="body">{title}</Text>
          </Focusable>
        </Box>
      ))}
    </Box>
  );
}

export function TitlePicker({
  placement,
  size,
  initial = 2,
  extra,
}: Readonly<{
  placement?: SelectionBarPlacement;
  size?: ControlSize;
  initial?: number;
  extra?: ReactNode;
}>) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(TITLES.slice(0, initial)),
  );
  const [everything, setEverything] = useState(false);
  const count = everything ? TOTAL : selected.size;
  const toggle = (title: string) => {
    setEverything(false);
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };
  const clear = () => {
    setEverything(false);
    setSelected(new Set());
  };
  return (
    <Box gap={12}>
      <TitleRows selected={everything ? new Set(TITLES) : selected} onToggle={toggle} />
      <SelectionBar.Root
        count={count}
        onClear={clear}
        label="Sélection"
        placement={placement}
        size={size}
      >
        <SelectionBar.Clear label="Tout désélectionner" />
        <SelectionBar.Status>{picked(count)}</SelectionBar.Status>
        {everything ? null : (
          <SelectionBar.SelectAll
            label={`Tout sélectionner (${TOTAL.toLocaleString('fr-FR')})`}
            onPress={() => setEverything(true)}
          />
        )}
        <SelectionBar.Actions label="Autres actions">
          <SelectionBar.Item icon="radar" tone="accent" label="Suivre" onPress={clear} />
          {extra}
          <SelectionBar.Item
            icon="radar-off"
            tone="danger"
            label="Ne plus suivre"
            onPress={clear}
          />
        </SelectionBar.Actions>
      </SelectionBar.Root>
    </Box>
  );
}

export function Narrow({ children }: Readonly<{ children: ReactNode }>) {
  return <Box w={360}>{children}</Box>;
}

const sDefinition = styles({
  row: { row: true, align: 'center', gap: 14, px: 16, py: 12 },
});
