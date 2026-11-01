import { useStyles } from '#ui/core/styles';
import { typeSpec as textRoles } from '#ui/core/tokens';
// The palette's parts: the field, the list, the face when nothing matches, and
// the row of hints under it.

import type { ReactNode } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { styles } from '#ui/core';
import { useCommand } from './command-context';
import { type CommandItem, type CommandSection, METRICS } from './command-list';

import { CommandRow, GUTTER } from './command-row';
import { useCursorScroll } from './use-cursor-scroll';

interface CommandInputProps {
  placeholder?: string;
  /** The accessible name of the field. Give it something the control that
   *  opened the palette does not also say. */
  label?: string;
}

const AROUND_LIST = 208;

/** How tall the list is drawn in this window. */
function useListHeight(): number {
  const { height } = useWindowDimensions();
  return Math.min(METRICS.maxHeight, Math.max(METRICS.tallRow * 2, height - AROUND_LIST));
}

/** The one thing a palette can be typed into. */
function Input({ placeholder, label = 'Search' }: Readonly<CommandInputProps>) {
  const s = useStyles(sDefinition);

  const { query, setQuery, sections, choose } = useCommand('Input');
  return (
    <Box row align="center" px={GUTTER} style={s.rule}>
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
            pl={6}
            pr={0}
            py={14}
            gap={16}
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

/** The scrolling list of results, one height whatever it holds, so the footer stays
 * put while typing. Renders nothing while the query matches nothing, which is when a
 * `<Command.Empty>` beside it takes the same space. */
function List() {
  const s = useStyles(sDefinition);

  const { sections, query, cursor, selected, point, choose, scroll, shown } = useCommand('List');
  const scroller = useCursorScroll(scroll, METRICS.maxHeight);
  const height = useListHeight();

  if (shown === 0) return null;

  return (
    <ScrollView
      {...scroller}
      style={{ height }}
      contentContainerStyle={s.listBody}
      showsVerticalScrollIndicator={false}
    >
      {sections.map((section, index) => (
        <Box key={section.title || `run-${index}`}>
          {section.title ? (
            <Box h={METRICS.heading} justify="flex-end" px={GUTTER - METRICS.pad} pb={6}>
              <Text variant="overline" color="textDim">
                {section.title}
              </Text>
            </Box>
          ) : null}
          {section.items.map((item) => (
            <CommandRow
              key={item.id}
              item={item}
              query={query}
              open={item.id === selected}
              cursor={item.id === cursor}
              onHover={point}
              onPress={choose}
            />
          ))}
          {index === sections.length - 1 ? null : <Box h={METRICS.sectionGap} />}
        </Box>
      ))}
    </ScrollView>
  );
}

/** What the list shows when the query matches nothing. */
function Empty({ children }: Readonly<{ children?: ReactNode }>) {
  const { shown } = useCommand('Empty');
  const height = useListHeight();
  if (shown > 0) return null;
  return (
    <Box h={height} center>
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
  const s = useStyles(sDefinition);

  return (
    <Box row align="center" gap={16} h={FOOTER_HEIGHT} pl={GUTTER} pr={8} style={s.ruleTop}>
      {children}
    </Box>
  );
}

const FOOTER_HEIGHT = 48;

const sDefinition = styles({
  rule: { borderBottomWidth: 1, borderBottomColor: 'border' },
  ruleTop: { borderTopWidth: 1, borderTopColor: 'border' },
  listBody: { p: METRICS.pad },
  entry: { fontSize: textRoles.label.size, fontWeight: '500' },
});

export type { CommandInputProps };
export { Empty, Footer, Input, List, useListHeight };
