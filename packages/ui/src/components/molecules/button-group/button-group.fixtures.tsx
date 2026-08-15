import { Box } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

import { IconButton } from '#ui/components/atoms/icon-button';

import { Text } from '#ui/components/atoms/text';

import { TextField } from '#ui/components/atoms/text-field';

import { ButtonGroup } from './button-group';

export function Caption({ children }: Readonly<{ children: string }>) {
  return (
    <Text variant="overline" color="textDim">
      {children}
    </Text>
  );
}

export function Split() {
  return (
    <ButtonGroup.Root label="Subscription">
      <Button label="Follow" />
      <ButtonGroup.Separator />
      <IconButton variant="primary" icon="chevron-down" label="More options" />
    </ButtonGroup.Root>
  );
}

export function Segmented() {
  return (
    <Box gap={20}>
      <Box gap={10}>
        <Caption>md</Caption>
        <ButtonGroup.Root label="View">
          <Button variant="outline" label="Grid" active />
          <Button variant="outline" label="List" />
          <Button variant="outline" label="Detail" />
        </ButtonGroup.Root>
      </Box>
      <Box gap={10}>
        <Caption>sm</Caption>
        <ButtonGroup.Root label="View" size="sm">
          <Button variant="outline" label="Grid" active />
          <Button variant="outline" label="List" />
          <Button variant="outline" label="Detail" />
        </ButtonGroup.Root>
      </Box>
    </Box>
  );
}

export function Chips() {
  return (
    <Box gap={20}>
      <ButtonGroup.Root label="Server address">
        <ButtonGroup.Addon>https://</ButtonGroup.Addon>
        <Button variant="glass" label="kroma" />
        <ButtonGroup.Addon>.tv</ButtonGroup.Addon>
      </ButtonGroup.Root>
      <ButtonGroup.Root label="Maximum bitrate">
        <IconButton variant="glass" icon="minus" label="Lower the bitrate" />
        <ButtonGroup.Addon>8 Mb/s</ButtonGroup.Addon>
        <IconButton variant="glass" icon="plus" label="Raise the bitrate" />
      </ButtonGroup.Root>
    </Box>
  );
}

export function Borderless() {
  return (
    <ButtonGroup.Root label="Sharing">
      <Button label="Copy link" icon="link" />
      <ButtonGroup.Separator />
      <Button label="Invite" icon="user-plus" />
    </ButtonGroup.Root>
  );
}

export function WithEntry() {
  return (
    <Box gap={20} w={460}>
      <ButtonGroup.Root label="Server address">
        <TextField flex={1} minW={0} icon="world-search" placeholder="kroma.local:4040" />
        <Button label="Connect" />
      </ButtonGroup.Root>
      <ButtonGroup.Root label="Share link" size="sm">
        <ButtonGroup.Addon>https://</ButtonGroup.Addon>
        <TextField flex={1} minW={0} defaultValue="kroma.tv/i/8f2ad1" readOnly selectOnFocus />
        <IconButton variant="glass" icon="copy" label="Copy link" />
      </ButtonGroup.Root>
    </Box>
  );
}

export function Vertical() {
  return (
    <ButtonGroup.Root orientation="vertical" label="Volume">
      <IconButton variant="glass" icon="plus" label="Volume up" />
      <IconButton variant="glass" icon="minus" label="Volume down" />
      <IconButton variant="glass" icon="volume-off" label="Mute" />
    </ButtonGroup.Root>
  );
}

export function Toolbar() {
  return (
    <ButtonGroup.Root label="Toolbar">
      <ButtonGroup.Root label="Zoom">
        <IconButton variant="glass" icon="zoom-out" label="Zoom out" />
        <IconButton variant="glass" icon="zoom-in" label="Zoom in" />
      </ButtonGroup.Root>
      <ButtonGroup.Root label="View">
        <IconButton variant="glass" icon="layout-grid" label="Grid" />
        <IconButton variant="glass" icon="list" label="List" />
        <IconButton variant="glass" icon="table" label="Table" />
      </ButtonGroup.Root>
      <ButtonGroup.Root label="Settings">
        <IconButton variant="glass" icon="settings" label="Settings" />
      </ButtonGroup.Root>
    </ButtonGroup.Root>
  );
}
