import type { ReactNode } from 'react';
import {
  SuggestionEmpty,
  SuggestionHint,
  SuggestionMedia,
  type SuggestionMediaProps,
} from '#ui/components/organisms/suggestions/suggestion-parts.component';
import {
  type ItemParts,
  SuggestionItem,
} from '#ui/components/organisms/suggestions/suggestion-row.component';

type ComboboxMediaProps = SuggestionMediaProps;

interface ComboboxItemProps {
  /** The name a press sets, and the words the row draws. */
  value: string;
  disabled?: boolean;
  /** Its <Combobox.Media> and <Combobox.Hint>, which must be DIRECT children. */
  children?: ReactNode;
}

interface ComboboxValueProps {
  /** The name this face is for: it draws while the entry holds exactly that name. */
  value: string;
  /** Its <Combobox.Media>. */
  children?: ReactNode;
}

/** The mark of a name: a face, a logo or a glyph. Inside a <Combobox.Item> or
 *  a <Combobox.Value>, which size it (the entry's mark is smaller than a
 *  row's) and give it the name its initials are drawn from. It takes the
 *  corner of what holds it less the inset, so the two stay concentric. */
function Media(props: Readonly<ComboboxMediaProps>) {
  return <SuggestionMedia {...props} />;
}

/** The second line of a <Combobox.Item>: what tells two of the same name
 *  apart, as a job and a known work. */
function Hint({ children }: Readonly<{ children?: ReactNode }>) {
  return <SuggestionHint>{children}</SuggestionHint>;
}

/** What the list says once something is typed and nothing is left to suggest. */
function Empty({ children }: Readonly<{ children?: ReactNode }>) {
  return <SuggestionEmpty>{children}</SuggestionEmpty>;
}

const ITEM_PARTS: ItemParts = { part: 'Combobox.Item', Media, Hint };

/** One suggestion: a name the list offers, with the letters typed marked. A
 *  press sets the value to it and closes the list, and its <Combobox.Media>
 *  becomes the face at the start of the entry. */
function Item(props: Readonly<ComboboxItemProps>) {
  return <SuggestionItem {...props} parts={ITEM_PARTS} />;
}

/** Gives a name its face: while the entry holds `value`, its <Combobox.Media>
 *  draws at the start of the entry, over the one a pick left. For a name the
 *  caller already knows the face of, as one loaded with the record. It draws
 *  nothing where it is written. */
function Value(_props: Readonly<ComboboxValueProps>) {
  return null;
}

export type { ComboboxItemProps, ComboboxMediaProps, ComboboxValueProps };
export { Empty, Hint, Item, Media, Value };
