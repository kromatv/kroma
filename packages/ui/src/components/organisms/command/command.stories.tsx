import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Kbd } from '#ui/components/atoms/kbd';
import { Text } from '#ui/components/atoms/text';
import { Command } from './command';
import { useCommandResults } from './command-context';
import type { CommandItem } from './command-list';

const LIBRARY: CommandItem[] = [
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

function Tally() {
  const { shown, total } = useCommandResults();
  return (
    <Box row flex justify="flex-end">
      <Text variant="meta" color="textDim">
        {`${shown} of ${total}`}
      </Text>
    </Box>
  );
}

function Palette() {
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

export default story({
  name: 'Command',
  group: 'Overlays',
  docs: 'The search-and-jump overlay: one field, a ranked and grouped list, and Enter to open. Render it while it is open and unmount it to close.\n\n**Ranked, not filtered.** A query is matched as a subsequence and scored (`lib/fuzzy-search`, the same matcher the icon browser uses), so `iconb` finds **IconButton** and the best rows rise to the top. A hit on what a row *says* always outranks a hit on what it is *filed under*.\n\n**The rows are data**, which is DESIGN.md §3 tests T2 and T5: the cursor is arithmetic over one flat order, and no arrangement of nested children keeps that true when there is no DOM to ask. Everything else is a part (the field, the list, the empty face and the footer), so a caller decides what the sheet holds.\n\nOn the web the arrows drive a cursor the pointer shares; on a television there is no keyboard, so the spatial navigator walks the rows and the palette draws no cursor of its own.',
  usage: `<Command.Root items={rows} selected={open} onSelect={go} onClose={shut}>
  <Command.Input label="Search" placeholder="Search…" />
  <Command.List />
  <Command.Empty>No results.</Command.Empty>
  <Command.Footer>
    <Kbd>↵</Kbd>
    <Text variant="meta" color="textDim">open</Text>
  </Command.Footer>
</Command.Root>`,
  guidelines: {
    do: [
      'Give each row a `group`: a palette of thirty flat rows is a list, not a map.',
      'Put anything else worth finding a row by in `keywords` - a summary, a path, a synonym.',
      'Name the field something the control that opened the palette does not also say: two controls sharing one accessible name is ambiguous.',
    ],
    dont: [
      "Don't sort the items by relevance yourself - the palette ranks a query and keeps your order when there is none.",
      "Don't reach for it on a screen that is only ever driven by a remote: a ten-foot search is a keyboard, not a palette.",
    ],
  },
  matrix: false,
  width: 'fill',
  render: () => <Palette />,
});
