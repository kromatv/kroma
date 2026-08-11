import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import { TextField } from '#ui/components/atoms/text-field';
import { ButtonGroup } from './button-group';

function Caption({ children }: Readonly<{ children: string }>) {
  return (
    <Text variant="overline" color="textDim">
      {children}
    </Text>
  );
}

function Split() {
  return (
    <ButtonGroup.Root label="Abonnement">
      <Button label="Suivre" />
      <ButtonGroup.Separator />
      <IconButton variant="primary" icon="chevron-down" label="Plus d’options" />
    </ButtonGroup.Root>
  );
}

function Segmented() {
  return (
    <Box gap={20}>
      <Box gap={10}>
        <Caption>md</Caption>
        <ButtonGroup.Root label="Affichage">
          <Button variant="outline" label="Grille" active />
          <Button variant="outline" label="Liste" />
          <Button variant="outline" label="Détail" />
        </ButtonGroup.Root>
      </Box>
      <Box gap={10}>
        <Caption>sm</Caption>
        <ButtonGroup.Root label="Affichage" size="sm">
          <Button variant="outline" label="Grille" active />
          <Button variant="outline" label="Liste" />
          <Button variant="outline" label="Détail" />
        </ButtonGroup.Root>
      </Box>
    </Box>
  );
}

function Chips() {
  return (
    <Box gap={20}>
      <ButtonGroup.Root label="Adresse du serveur">
        <ButtonGroup.Addon>https://</ButtonGroup.Addon>
        <Button variant="glass" label="kroma" />
        <ButtonGroup.Addon>.tv</ButtonGroup.Addon>
      </ButtonGroup.Root>
      <ButtonGroup.Root label="Débit maximal">
        <IconButton variant="glass" icon="minus" label="Réduire le débit" />
        <ButtonGroup.Addon>8 Mb/s</ButtonGroup.Addon>
        <IconButton variant="glass" icon="plus" label="Augmenter le débit" />
      </ButtonGroup.Root>
    </Box>
  );
}

function Borderless() {
  return (
    <ButtonGroup.Root label="Partage">
      <Button label="Copier le lien" icon="link" />
      <ButtonGroup.Separator />
      <Button label="Inviter" icon="user-plus" />
    </ButtonGroup.Root>
  );
}

function WithEntry() {
  return (
    <Box gap={20} w={460}>
      <ButtonGroup.Root label="Adresse du serveur">
        <TextField flex={1} minW={0} icon="world-search" placeholder="kroma.local:4040" />
        <Button label="Connecter" />
      </ButtonGroup.Root>
      <ButtonGroup.Root label="Lien de partage" size="sm">
        <ButtonGroup.Addon>https://</ButtonGroup.Addon>
        <TextField flex={1} minW={0} defaultValue="kroma.tv/i/8f2ad1" readOnly selectOnFocus />
        <IconButton variant="glass" icon="copy" label="Copier le lien" />
      </ButtonGroup.Root>
    </Box>
  );
}

function Vertical() {
  return (
    <ButtonGroup.Root orientation="vertical" label="Volume">
      <IconButton variant="glass" icon="plus" label="Augmenter le volume" />
      <IconButton variant="glass" icon="minus" label="Baisser le volume" />
      <IconButton variant="glass" icon="volume-off" label="Couper le son" />
    </ButtonGroup.Root>
  );
}

function Toolbar() {
  return (
    <ButtonGroup.Root label="Barre d’outils">
      <ButtonGroup.Root label="Zoom">
        <IconButton variant="glass" icon="zoom-out" label="Dézoomer" />
        <IconButton variant="glass" icon="zoom-in" label="Zoomer" />
      </ButtonGroup.Root>
      <ButtonGroup.Root label="Affichage">
        <IconButton variant="glass" icon="layout-grid" label="Grille" />
        <IconButton variant="glass" icon="list" label="Liste" />
        <IconButton variant="glass" icon="table" label="Tableau" />
      </ButtonGroup.Root>
      <ButtonGroup.Root label="Réglages">
        <IconButton variant="glass" icon="settings" label="Réglages" />
      </ButtonGroup.Root>
    </ButtonGroup.Root>
  );
}

export default story({
  name: 'ButtonGroup',
  group: 'Actions',
  docs: 'A row (or a column) of related controls rendered as ONE control: adjacent members share a single border line and their inner corners are flattened, so three buttons read as one segmented object. A split button, a toolbar cluster, a value with its unit welded to the end.\n\nThe browser does this with `:first-child` and a collapsed border. React Native has neither, so **Root counts its children and publishes each one\'s position through a context**, one provider per child, and the members shape themselves from it. It is a context rather than `cloneElement` because a member is routinely wrapped (a Tooltip trigger, a Menu trigger) and cloned props would land on the wrapper instead of the control. `Button`, `IconButton`, `TextField` and `ButtonGroup.Addon` read it; **anything else keeps its own shape**, which is a visible signal that a child is not a member.\n\nIt carries no selection state: it is `role="group"` plus a shape. For one-of-N use a <SegmentedControl>, and for a set of toggles a <ChoiceList>.',
  usage: `<ButtonGroup.Root label="Abonnement">
  <Button label="Suivre" onPress={follow} />
  <ButtonGroup.Separator />
  <IconButton icon="chevron-down" variant="primary" label="Plus d'options" />
</ButtonGroup.Root>

// A toolbar is a group of groups: the outer one spaces the clusters
// instead of welding them.
<ButtonGroup.Root label="Barre d'outils">
  <ButtonGroup.Root label="Zoom">…</ButtonGroup.Root>
  <ButtonGroup.Root label="Affichage">…</ButtonGroup.Root>
</ButtonGroup.Root>`,
  guidelines: {
    do: [
      "Name the group: Root's `label` is what a screen reader announces before the members.",
      'Give every member the same variant, and let the group own `size` so they share one height.',
      'Add a `Separator` only between members that carry no border of their own.',
      'Nest groups to build a toolbar: the outer group spaces the clusters.',
      'Give a `<TextField>` member `flex={1} minW={0}` so it takes the row and can still shrink.',
    ],
    dont: [
      "Don't use it to pick one option among several - that is a <SegmentedControl>.",
      "Don't wrap a member in a layout <Box>: the wrapper becomes the member and takes the shape.",
      "Don't clip the group (`overflow`): a focused member's ring is painted outside its box.",
    ],
  },
  matrix: false,
  render: () => <Split />,
  scenes: [
    {
      name: 'A segmented run',
      docs: 'Bordered members need no separator: their shared edge is one line because each member after the first drops its leading border. `size` on the group is what keeps the run one height.',
      render: () => <Segmented />,
    },
    {
      name: 'Text as a prefix and a suffix',
      docs: 'A chip nothing can press, shaped like the members around it: it says what the neighbouring value IS, so the value itself does not have to spell it out.',
      render: () => <Chips />,
    },
    {
      name: 'A separator for borderless members',
      docs: 'A filled member has no edge to share, so two of them would run together into one slab. The separator draws the line the collapsed borders would have drawn, and it occupies a slot, so the member after it is still shaped as the member after it.',
      render: () => <Borderless />,
    },
    {
      name: 'An entry welded to a button',
      docs: "A `<TextField>` is a member like any button: it takes the group's size, drops the corners and the border edge it shares, and lifts itself over its neighbour while it wears the focus ring. That last part is why the field reads the slot rather than the group styling it - only the field knows it is focused, and a collapsed border would otherwise let the member after it overpaint the ring.\n\nWhere this is the whole control rather than a row of them - a search box with a count welded inside its own well - reach for an <InputGroup> instead: there the shell is one well and the addons live *inside* it, so the field draws no fill, frost or edge of its own.",
      render: () => <WithEntry />,
    },
    {
      name: 'Vertical',
      docs: 'The same rule turned ninety degrees: the top and bottom corners are the ones that survive, and the shared border is the top one. What a remote walks with up and down rather than left and right.',
      render: () => <Vertical />,
    },
    {
      name: 'Nested clusters',
      docs: 'A group inside a group swallows the position it inherits and hands its own children fresh ones, while the outer group stops collapsing borders and spaces the clusters instead. That single rule is the whole of how a toolbar is written.',
      render: () => <Toolbar />,
    },
  ],
});
