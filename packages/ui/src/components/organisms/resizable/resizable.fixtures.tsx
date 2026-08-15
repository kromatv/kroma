import type { ReactNode } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

import { Text } from '#ui/components/atoms/text';

import { Resizable } from './resizable';

import { useResizablePanel } from './resizable-panel';

export // Every pane reports its own share, which is the fastest way to see what a seam
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

export interface PaneProps {
  name: string;
  hint?: string;
  children?: ReactNode;
}

export function Shutter() {
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

export function Collapsing() {
  return (
    <Box h={200}>
      <Resizable.Root>
        <Resizable.Panel asChild minSize="200px">
          <Pane name="Canvas" hint="The panel beside this one is collapsible." />
        </Resizable.Panel>
        <Resizable.Handle label="Resize the inspector" />
        <Resizable.Panel asChild defaultSize={30} minSize={20} collapsible>
          <Shutter />
        </Resizable.Panel>
      </Resizable.Root>
    </Box>
  );
}

export function Nested() {
  return (
    <Box h={280}>
      <Resizable.Root>
        <Resizable.Panel asChild defaultSize={30} minSize="160px">
          <Pane name="List" />
        </Resizable.Panel>
        <Resizable.Handle label="Resize the list" />
        <Resizable.Panel asChild minSize="240px">
          <Resizable.Root orientation="vertical">
            <Resizable.Panel asChild minSize="80px">
              <Pane name="Stage" hint="The outer seam moves this and the console together." />
            </Resizable.Panel>
            <Resizable.Handle label="Resize the console" />
            <Resizable.Panel asChild defaultSize={30} minSize="80px">
              <Pane name="Console" hint="minSize 80px" />
            </Resizable.Panel>
          </Resizable.Root>
        </Resizable.Panel>
      </Resizable.Root>
    </Box>
  );
}
