import type { ReactNode } from 'react';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text } from '#ui/components/atoms/text';
import { markCorner } from '#ui/components/organisms/suggestions/entry-metrics';
import { EntryWell } from '#ui/components/organisms/suggestions/entry-well.component';
import { SuggestionDialog } from '#ui/components/organisms/suggestions/suggestion-dialog.component';
import type { SuggestionSurface } from '#ui/components/organisms/suggestions/suggestion-surface';
import { sv, useStyleScope } from '#ui/core';
import { PLACEHOLDER } from '#ui/lib/field-shell';

interface ComboboxDialogProps {
  surface: SuggestionSurface;
  lead: ReactNode;
}

const stopVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      grow: 1,
      _hover: { bg: 'tint/8' },
      _focus: { bg: 'accentSoft' },
    },
  },
});

const NOTHING_MORE = () => undefined;

function stopName(label: string, text: string): string {
  if (text === '') {
    return label;
  }
  return label === '' ? text : `${label}: ${text}`;
}

function ValueStop({ surface, lead }: Readonly<ComboboxDialogProps>) {
  const { metrics, look, entry } = surface;
  const scope = useStyleScope();
  const end = metrics.control.px - metrics.inset;
  return (
    <Focusable
      label={stopName(look.label, entry.text)}
      disabled={look.disabled}
      onPress={() => entry.setOpen(true, 'trigger')}
      sv={stopVariants}
      style={{
        height: metrics.mark,
        gap: metrics.gap,
        paddingStart: lead === null ? end : 0,
        paddingEnd: end,
        borderRadius: markCorner(metrics, scope),
      }}
    >
      {lead}
      <Text
        lines={1}
        color={entry.text === '' ? PLACEHOLDER : 'text'}
        style={{ fontSize: metrics.control.fontSize }}
      >
        {entry.text === '' ? look.placeholder : entry.text}
      </Text>
    </Focusable>
  );
}

/** The D-pad's presentation: the well is one stop showing the name and its
 *  face, and its press opens a dialog with the entry, the keyboard where
 *  there is no real one, and the suggestions as rows. A pick closes it. */
function ComboboxDialog(props: Readonly<ComboboxDialogProps>) {
  const { metrics, look } = props.surface;
  return (
    <SuggestionDialog surface={props.surface} onPicked={NOTHING_MORE}>
      <EntryWell metrics={metrics} filled focused={false} invalid={look.invalid}>
        <ValueStop {...props} />
      </EntryWell>
    </SuggestionDialog>
  );
}

export { ComboboxDialog };
