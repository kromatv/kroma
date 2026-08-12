import { story } from '@kroma/workbench/story';
import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import type { GroupOrientation } from '#ui/lib/group-shape';
import { Resizable } from './resizable';
import { useResizablePanel } from './resizable-panel';

// Every pane reports its own share, which is the fastest way to see what a seam
// is actually doing - and what `useResizablePanel()` is for.
function Pane({ name, hint, children }: Readonly<PaneProps>) {
  const panel = useResizablePanel();
  return (
    <Box flex p={14} gap={4} bg="surface1" radius="md">
      <Box row align="center" gap={8}>
        <Text variant="overline" color="accent">
          {name}
        </Text>
        <Box flex />
        <Text variant="meta" color="textDim">
          {`${Math.round(panel.size)}% · ${panel.points}pt`}
        </Text>
      </Box>
      {hint ? (
        <Text variant="meta" color="textDim" lines={2}>
          {hint}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

interface PaneProps {
  name: string;
  hint?: string;
  children?: ReactNode;
}

function Shutter() {
  const panel = useResizablePanel();
  return (
    <Pane name="Inspector" hint="Drag the seam right until it shuts, or use the button.">
      <Box row pt={6}>
        <Button
          size="sm"
          variant="outline"
          label={panel.collapsed ? 'Shut' : 'Hide'}
          onPress={panel.collapse}
          disabled={panel.collapsed}
        />
      </Box>
    </Pane>
  );
}

function Collapsing() {
  return (
    <Box h={200}>
      <Resizable.Root>
        <Resizable.Panel minSize="200px">
          <Pane name="Canvas" hint="The panel beside this one is collapsible." />
        </Resizable.Panel>
        <Resizable.Handle label="Resize the inspector" />
        <Resizable.Panel defaultSize={30} minSize={20} collapsible>
          <Shutter />
        </Resizable.Panel>
      </Resizable.Root>
    </Box>
  );
}

function Nested() {
  return (
    <Box h={280}>
      <Resizable.Root>
        <Resizable.Panel defaultSize={30} minSize="160px">
          <Pane name="List" />
        </Resizable.Panel>
        <Resizable.Handle label="Resize the list" />
        <Resizable.Panel minSize="240px">
          <Resizable.Root orientation="vertical">
            <Resizable.Panel minSize="80px">
              <Pane name="Stage" hint="The outer seam moves this and the console together." />
            </Resizable.Panel>
            <Resizable.Handle label="Resize the console" />
            <Resizable.Panel defaultSize={30} minSize="80px">
              <Pane name="Console" hint="minSize 80px" />
            </Resizable.Panel>
          </Resizable.Root>
        </Resizable.Panel>
      </Resizable.Root>
    </Box>
  );
}

export default story({
  name: 'Resizable',
  group: 'Layout',
  docs: 'Panels a reader can re-proportion, and the seams they meet at. shadcn\'s shape - a group, its panels and a handle between them - over this kit\'s own machinery, because react-resizable-panels is DOM-only and this seam has to work under a D-pad.\n\nThe whole strip is the control: drag it with a pointer, **press** it to take the arrow keys, and press it again (or hold it) to put its two panels back. A size is a share of the group (`25`) or points (`"280px"`), and the layout is held as shares, so a panel dragged wide on a desk comes back whole after a spell on a laptop.',
  usage: `<Resizable.Root orientation="horizontal" autoSaveId="inspector">
  <Resizable.Panel defaultSize={25} minSize="200px">
    <ComponentList />
  </Resizable.Panel>
  <Resizable.Handle label="Resize the list" />
  <Resizable.Panel minSize="480px">
    <Canvas />
  </Resizable.Panel>
</Resizable.Root>`,
  guidelines: {
    do: [
      'Give every panel the `minSize` its contents actually stop working at - the seam stops there instead of somewhere arbitrary.',
      'Label each handle for what it resizes: a seam announces itself to assistive tech as a slider.',
      'Pass `autoSaveId` when the reader would resent re-dragging it every visit.',
    ],
    dont: [
      "Don't put anything pressable inside the seam: it is one D-pad stop, and a second target inside it cannot be reached.",
      "Don't reach for it to lay out a screen that has one right arrangement - a seam is for a reader with a preference, not for a designer without one.",
    ],
  },
  matrix: false,
  width: 'fill',
  args: { orientation: 'horizontal' as GroupOrientation, disabled: false },
  controls: { orientation: ['horizontal', 'vertical'], disabled: 'boolean' },
  render: ({ orientation, disabled }) => (
    <Box h={280}>
      <Resizable.Root orientation={orientation} disabled={disabled}>
        <Resizable.Panel defaultSize={30} minSize="120px">
          <Pane name="One" hint="minSize 120px" />
        </Resizable.Panel>
        <Resizable.Handle label="Resize the first panel" />
        <Resizable.Panel minSize="160px">
          <Pane name="Two" hint="Takes what the others leave" />
        </Resizable.Panel>
        <Resizable.Handle label="Resize the last panel" />
        <Resizable.Panel defaultSize={25} minSize="120px">
          <Pane name="Three" hint="minSize 120px" />
        </Resizable.Panel>
      </Resizable.Root>
    </Box>
  ),
  scenes: [
    {
      name: 'Collapsible',
      docs: 'A panel that says `collapsible` shuts rather than stopping at its floor: drag past halfway between `collapsedSize` and `minSize` and it snaps closed. `useResizablePanel()` is how a control somewhere inside it drives the same thing.',
      example: () => <Collapsing />,
    },
    {
      name: 'Nested',
      docs: 'A panel holding a group of its own. Each group measures itself, so the inner one knows nothing about the outer one and a points minimum still means points.',
      example: () => <Nested />,
    },
  ],
});
