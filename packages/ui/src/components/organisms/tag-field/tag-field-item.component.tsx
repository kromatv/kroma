import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { rowMediaCorner } from '#ui/components/organisms/suggestions/entry-metrics';
import { useSuggesting } from '#ui/components/organisms/suggestions/suggestion-context';
import {
  type ItemParts,
  SuggestionItem,
  SuggestionRow,
} from '#ui/components/organisms/suggestions/suggestion-row.component';
import { useStyleScope } from '#ui/core';
import { Hint, Media } from './tag-field-parts.component';

interface TagFieldItemProps {
  /** The name a press adds, and the words the row draws. */
  value: string;
  disabled?: boolean;
  /** Its <TagField.Media> and <TagField.Hint>, which must be DIRECT children. */
  children?: ReactNode;
}

const ITEM_PARTS: ItemParts = { part: 'TagField.Item', Media, Hint };

/** One suggestion: a name the list offers, with the letters the query found
 *  marked. A press adds it, and its <TagField.Media> follows it into the tag
 *  unless a <TagField.Tag> for that name says otherwise. */
function Item(props: Readonly<TagFieldItemProps>) {
  return <SuggestionItem {...props} parts={ITEM_PARTS} />;
}

/** The row that adds what is typed, as it is typed. */
function FreeRow({ name, label }: Readonly<{ name: string; label: string }>) {
  const field = useSuggesting('TagField.Root');
  const size = field.rowMedia;
  const corner = rowMediaCorner(useStyleScope());
  return (
    <SuggestionRow
      field={field}
      label={label}
      lead={
        <Box w={size} h={size} center radius={corner} bg="tint/8">
          <Icon name="plus" size={Math.round(size * 0.5)} color="textMuted" />
        </Box>
      }
      onPress={() => field.pick(name, null)}
    >
      <Text variant="body" lines={1} color="text">
        {label}
      </Text>
    </SuggestionRow>
  );
}

export type { TagFieldItemProps };
export { FreeRow, Item };
