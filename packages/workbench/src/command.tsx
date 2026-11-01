// The workbench's ⌘K.
//
// Searching, the cursor, the overlay and the scroll arithmetic all live in the
// kit's <Command>; what is left here is the mapping from a story or an article
// to a row, and the two keys that open and close a palette.

import {
  Command,
  type CommandItem,
  Kbd,
  Row,
  Text,
  useCommandResults,
  webDocument,
} from '@kromatv/ui/kit';
import { type ReactNode, useEffect } from 'react';
import type { StoryEntry } from './entry';
import type { Page } from './page';
import { glyphFor } from './registry';

/** A story and an article are both something to open, so the palette is handed
 * the little they have in common rather than a union. */
function entriesOf(stories: readonly StoryEntry[], pages: readonly Page[] = []): CommandItem[] {
  return [
    ...pages.map((page) => ({
      id: page.id,
      label: page.title,
      group: page.group,
      // An article carries one glyph of its own: the section glyphs name
      // component families, and a guide belongs to none of them.
      icon: 'book' as const,
      // Searched as well as the title: an article's one-line summary is the
      // only thing about it that says what is inside.
      keywords: page.summary,
      meta: page.group,
    })),
    ...stories.map((story) => ({
      id: story.id,
      label: story.name,
      group: story.group,
      icon: glyphFor(story.group),
      keywords: story.tier,
      meta: story.group,
    })),
  ];
}

/** Whether a chosen row leads to an article rather than to a story. */
function isPage(pages: readonly Page[] | undefined, id: string): boolean {
  return (pages ?? []).some((page) => page.id === id);
}

// Capture phase: react-native-web's TextInput stops propagation on keydown, so a
// bubbling listener is deaf while a field is focused.
function useCaptureKey(match: (event: KeyboardEvent) => boolean, onKey: () => void): void {
  useEffect(() => {
    const document = webDocument();
    if (!document) return;
    const listener = (event: KeyboardEvent) => {
      if (!match(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onKey();
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [match, onKey]);
}

const isEscape = (event: KeyboardEvent): boolean => event.key === 'Escape';

function useEscapeKey(onClose: () => void): void {
  useCaptureKey(isEscape, onClose);
}

interface CommandPaletteProps {
  stories: readonly StoryEntry[];
  pages?: readonly Page[];
  selected: string;
  /** `page` says which of the two lists the id belongs to, which only the
   *  palette is in a position to answer. */
  onSelect: (id: string, page: boolean) => void;
  onClose: () => void;
}

function CommandPalette({
  stories,
  pages,
  selected,
  onSelect,
  onClose,
}: Readonly<CommandPaletteProps>) {
  return (
    <Command.Root
      items={entriesOf(stories, pages)}
      selected={selected}
      onSelect={(item) => onSelect(item.id, isPage(pages, item.id))}
      onClose={onClose}
    >
      {/* Not "Search components": that is the sidebar button's accessible name,
          and two controls sharing one is ambiguous to assistive tech. */}
      <Command.Input label="Search the component list" placeholder="Search components…" />
      <Command.List />
      <Command.Empty>No components found.</Command.Empty>
      <Command.Footer>
        <Hint label="navigate">
          <Kbd icon="arrow-up" />
          <Kbd icon="arrow-down" />
        </Hint>
        <Hint label="select">
          <Kbd icon="corner-down-left" />
        </Hint>
        <Hint label="close">
          <Kbd>esc</Kbd>
        </Hint>
        <Tally />
      </Command.Footer>
    </Command.Root>
  );
}

function Hint({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Row gap={3}>
      {children}
      <Text variant="meta" color="textDim" style={HINT}>
        {label}
      </Text>
    </Row>
  );
}

function Tally() {
  const { shown, total } = useCommandResults();
  return (
    <Text variant="meta" color="textDim" font="mono" style={TALLY}>
      {`${shown} of ${total}`}
    </Text>
  );
}

const HINT = { fontSize: 11.5, marginLeft: 3 } as const;
const TALLY = { fontSize: 11.5, marginLeft: 'auto' } as const;

export { CommandPalette, entriesOf, isPage, useEscapeKey };
