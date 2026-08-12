// The workbench's ⌘K.
//
// Searching, the cursor, the overlay and the scroll arithmetic all live in the
// kit's <Command>; what is left here is the mapping from a story or an article
// to a row, and the two keys that open and close a palette.

import {
  Command,
  type CommandItem,
  Kbd,
  Text,
  useCommandResults,
  webDocument,
  webWindow,
} from '@kroma/ui/kit';
import { useEffect } from 'react';
import type { Page } from './page';
import { glyphFor } from './registry';
import type { Story } from './story';

/** A story and an article are both something to open, so the palette is handed
 * the little they have in common rather than a union. */
function entriesOf(stories: readonly Story[], pages: readonly Page[] = []): CommandItem[] {
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

function isMac(): boolean {
  const agent = webWindow()?.navigator?.userAgent ?? '';
  return /Mac|iPhone|iPad|iPod/.test(agent);
}

/** `⌘ K` on a Mac, `Ctrl K` everywhere else. */
function commandHint(): string {
  return isMac() ? '⌘ K' : 'Ctrl K';
}

// Capture phase: react-native-web's TextInput stops propagation on keydown, so a
// bubbling listener is deaf while a field is focused. The event is swallowed too,
// to beat the browser's own ⌘K.
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

const isCommandK = (event: KeyboardEvent): boolean =>
  (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey);

const isEscape = (event: KeyboardEvent): boolean => event.key === 'Escape';

function useCommandKey(onOpen: () => void): void {
  useCaptureKey(isCommandK, onOpen);
}

function useEscapeKey(onClose: () => void): void {
  useCaptureKey(isEscape, onClose);
}

interface CommandPaletteProps {
  stories: readonly Story[];
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
        <Hint keys={['↑', '↓']} label="navigate" />
        <Hint keys={['↵']} label="select" />
        <Hint keys={['esc']} label="close" />
        <Tally />
      </Command.Footer>
    </Command.Root>
  );
}

function Hint({ keys, label }: Readonly<{ keys: readonly string[]; label: string }>) {
  return (
    <>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <Text variant="meta" color="textDim" style={HINT}>
        {label}
      </Text>
    </>
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

// Negative margins against the footer's own gap: a hint is a run of caps and
// one word, and the gap belongs between hints rather than inside one.
const HINT = { fontSize: 11.5, marginLeft: -9 } as const;
const TALLY = { fontSize: 11.5, marginLeft: 'auto' } as const;

export { CommandPalette, commandHint, entriesOf, isPage, useCommandKey, useEscapeKey };
