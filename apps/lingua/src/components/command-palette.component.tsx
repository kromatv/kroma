import { useBreakpoint } from '@kromatv/ui/kit';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Kbd } from '@kromatv/ui/kit/atoms/kbd';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Command, type CommandItem } from '@kromatv/ui/kit/organisms/command';
import { type ReactNode, useState } from 'react';
import type { CommandRegistry, LinguaCommand } from '#site/lib/command-registry';
import { usePaletteCommands } from '#site/lib/use-palette-commands.hook';

function itemOf({ run: _run, ...command }: LinguaCommand): CommandItem {
  return { ...command, actions: [{ id: 'run', label: command.verb ?? 'Open' }] };
}

function Hint({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Row gap={3} align="center">
      {children}
      <Text variant="meta" color="textDim" ml={3}>
        {label}
      </Text>
    </Row>
  );
}

function Footer() {
  const wide = useBreakpoint() !== 'base';
  return (
    <Command.Footer>
      {wide ? (
        <Row gap={14} align="center">
          <Hint label="move">
            <Kbd icon="arrow-up" />
            <Kbd icon="arrow-down" />
          </Hint>
          <Hint label="close">
            <Kbd>esc</Kbd>
          </Hint>
        </Row>
      ) : null}
      <Box flex />
      <Command.Primary />
    </Command.Footer>
  );
}

/** The command menu's sheet: the page's own rows, messages of its language, every project and language, and Lingua's actions. */
export function CommandPalette({
  registry,
  onClose,
}: Readonly<{ registry: CommandRegistry; onClose: () => void }>) {
  const [query, setQuery] = useState('');
  const { byId, searching } = usePaletteCommands(registry, query);
  return (
    <Command.Root
      modal
      closeLabel="Close the command menu"
      items={[...byId.values()].map(itemOf)}
      query={query}
      onQueryChange={setQuery}
      onSelect={(item) => void byId.get(item.id)?.run()}
      onClose={onClose}
    >
      <Command.Input
        label="Search Lingua"
        placeholder={
          searching
            ? 'Search messages, languages, actions…'
            : 'Search projects, languages, actions…'
        }
      />
      <Command.List />
      <Command.Empty>Nothing matches. Try a key, a word of the text, or a language.</Command.Empty>
      <Footer />
    </Command.Root>
  );
}
