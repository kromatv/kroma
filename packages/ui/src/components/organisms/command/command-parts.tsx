// The palette's parts: the field, the list, the face when nothing matches, and
// the row of hints under it.

import { type ReactNode, useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { styles } from '#ui/core';
import { useCommand } from './command-context';
import type { CommandItem, CommandSection } from './command-list';
import { METRICS } from './command-list';
import { CommandRow } from './command-row';

interface CommandInputProps {
  placeholder?: string;
  /** The accessible name of the field. Give it something the control that
   *  opened the palette does not also say. */
  label?: string;
}

/** The one thing a palette can be typed into. */
function Input({ placeholder, label = 'Search' }: Readonly<CommandInputProps>) {
  const { query, setQuery, sections, choose } = useCommand('Input');
  return (
    <Box row align="center" px={14} style={s.rule}>
      <Box flex>
        <Field.Root label={label} hideLabel>
          <Field.Input
            value={query}
            onValueChange={setQuery}
            onSubmit={() => choose(firstOf(sections))}
            placeholder={placeholder}
            physicalKeyboard
            autoFocus
            icon="search"
            // The sheet is the shell here: the palette opens focused, and a
            // fill, an edge or a ring on this row would outline a box the
            // dialog's own corners clip.
            flat
            px={0}
            py={14}
            gap={10}
            textStyle={s.entry}
          />
        </Field.Root>
      </Box>
    </Box>
  );
}

function firstOf(sections: readonly CommandSection[]): CommandItem | undefined {
  return sections[0]?.items[0];
}

/** The scrolling list of results. Renders nothing while the query matches
 * nothing, which is when a `<Command.Empty>` beside it takes the space. */
function List() {
  const { sections, cursor, selected, point, choose, scroll, shown } = useCommand('List');
  const list = useRef<ScrollView>(null);
  const offset = useRef(0);
  const viewport = useRef<number>(METRICS.maxHeight);

  useEffect(() => {
    const y = scroll(offset.current, viewport.current);
    if (y !== null) list.current?.scrollTo({ y, animated: false });
  }, [scroll]);

  if (shown === 0) return null;

  return (
    <ScrollView
      ref={list}
      style={s.list}
      contentContainerStyle={s.listBody}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.y;
      }}
      onLayout={(event) => {
        viewport.current = event.nativeEvent.layout.height;
      }}
      scrollEventThrottle={16}
    >
      {sections.map((section, index) => (
        <Box key={section.title || `run-${index}`}>
          {section.title ? (
            <Box h={METRICS.heading} justify="center" px={8}>
              <Text variant="overline" color="textDim">
                {section.title}
              </Text>
            </Box>
          ) : null}
          {section.items.map((item) => (
            <CommandRow
              key={item.id}
              item={item}
              open={item.id === selected}
              cursor={item.id === cursor}
              onHover={() => point(item)}
              onPress={() => choose(item)}
            />
          ))}
          {index === sections.length - 1 ? null : (
            <Box h={METRICS.separator} mx={-METRICS.pad} bg="border" />
          )}
        </Box>
      ))}
    </ScrollView>
  );
}

/** What the list shows when the query matches nothing. */
function Empty({ children }: Readonly<{ children?: ReactNode }>) {
  const { shown } = useCommand('Empty');
  if (shown > 0) return null;
  return (
    <Box py={34} center>
      <Text variant="meta" color="textDim">
        {children}
      </Text>
    </Box>
  );
}

/** The row under the list: the shortcut hints and the tally. Compose it from
 * `<Kbd>` and `<Text>`; `useCommandResults()` is how something inside it reads
 * how many rows are showing. */
function Footer({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Box row align="center" gap={14} px={14} py={9} style={s.ruleTop}>
      {children}
    </Box>
  );
}

const s = styles({
  rule: { borderBottomWidth: 1, borderBottomColor: 'border' },
  ruleTop: { borderTopWidth: 1, borderTopColor: 'border' },
  list: { maxH: METRICS.maxHeight },
  listBody: { p: METRICS.pad },
  entry: { fontSize: 15, fontWeight: '500' },
});

export type { CommandInputProps };
export { Empty, Footer, Input, List };
