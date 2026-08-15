import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

import { Kbd } from '#ui/components/atoms/kbd';

import { Text } from '#ui/components/atoms/text';

import { Command } from './command';

import { useCommandResults } from './command-context';

import type { CommandItem } from './command-list';

export const LIBRARY: CommandItem[] = [
  { id: 'films', label: 'Films', group: 'Libraries', icon: 'movie', meta: '412 titles' },
  { id: 'series', label: 'Series', group: 'Libraries', icon: 'device-tv', meta: '78 titles' },
  { id: 'music', label: 'Music', group: 'Libraries', icon: 'music', meta: '2,104 titles' },
  { id: 'resume', label: 'Resume playback', group: 'Actions', icon: 'player-play' },
  { id: 'scan', label: 'Scan the folders', group: 'Actions', icon: 'refresh' },
  { id: 'downloads', label: 'Downloads', group: 'Actions', icon: 'download' },
  { id: 'accounts', label: 'Accounts', group: 'Settings', icon: 'users', keywords: 'profiles' },
  { id: 'playback', label: 'Playback', group: 'Settings', icon: 'settings', keywords: 'bitrate' },
  { id: 'modules', label: 'Modules', group: 'Settings', icon: 'puzzle', keywords: 'extensions' },
];

export function Tally() {
  const { shown, total } = useCommandResults();
  return (
    <Box row flex justify="flex-end">
      <Text variant="meta" color="textDim">
        {`${shown} of ${total}`}
      </Text>
    </Box>
  );
}

export function Palette() {
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState('films');
  return (
    <Box h={480} p={20} bg="bg" radius="lg" overflow="hidden">
      <Box row align="center" gap={10}>
        <Button
          size="sm"
          variant="outline"
          icon="search"
          label="Search"
          onPress={() => setOpen(true)}
        />
        <Kbd>⌘ K</Kbd>
        <Box flex />
        <Text variant="meta" color="textDim">
          {picked}
        </Text>
      </Box>
      {open ? (
        <Command.Root
          items={LIBRARY}
          selected={picked}
          onSelect={(item) => setPicked(item.id)}
          onClose={() => setOpen(false)}
        >
          <Command.Input label="Search the library" placeholder="Search…" />
          <Command.List />
          <Command.Empty>No results.</Command.Empty>
          <Command.Footer>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <Text variant="meta" color="textDim">
              browse
            </Text>
            <Kbd>↵</Kbd>
            <Text variant="meta" color="textDim">
              open
            </Text>
            <Tally />
          </Command.Footer>
        </Command.Root>
      ) : null}
    </Box>
  );
}
