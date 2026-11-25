import { type ReactNode, useMemo } from 'react';
import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Spinner } from '#ui/components/atoms/spinner';
import { Text } from '#ui/components/atoms/text';
import { styles, sv, useStyleScope, useSv } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { CONTROL } from '#ui/lib/field-shell';
import { sortParts } from '#ui/lib/parts';
import { matchText, textRuns } from '#ui/lib/text-match';
import { useTDefault } from '#ui/services/i18n';
import { ROW_INSET, rowMediaCorner } from './entry-metrics';
import {
  MediaPlaceContext,
  type SuggestingField,
  useSuggesting,
  useSuggestionRow,
} from './suggestion-context';
import type { SuggestionItemShape } from './suggestions-of';

const TEXT_INSET = 10;

const rowVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 12,
      pe: TEXT_INSET,
      py: 6,
      minH: 44,
      radius: CONTROL.sm.radius,
      _hover: { bg: 'tint/8' },
    },
    label: { color: 'text', fontWeight: '500' },
  },
  variants: {
    active: { true: { root: { bg: 'tint/8' } } },
    led: { true: { root: { ps: ROW_INSET } }, false: { root: { ps: TEXT_INSET } } },
  },
  defaults: { active: false, led: false },
});

type SuggestionRowProps = Readonly<{
  label: string;
  lead: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}>;

function PanelRow({ label, lead, disabled = false, onPress, children }: SuggestionRowProps) {
  const s = useStyles(sDefinition);
  const row = useSuggestionRow();
  const slots = useSv(rowVariants)({ active: row.active, led: lead !== null });
  const picked = () => {
    onPress();
    row.onPicked();
  };
  return (
    <Pressable
      nativeID={row.nativeID}
      role="option"
      aria-label={label}
      aria-selected={row.active}
      aria-disabled={disabled}
      tabIndex={-1}
      onPress={disabled ? undefined : picked}
      onHoverIn={row.onHoverIn}
      onLayout={({ nativeEvent: { layout } }) => row.onLayout?.(layout.y, layout.height)}
      style={[slots.root, row.active && row.keyed ? s.keyed : null, disabled ? s.disabled : null]}
    >
      {lead}
      <Box flex minW={0} gap={2}>
        {children}
      </Box>
    </Pressable>
  );
}

function DialogRow({ label, lead, disabled = false, onPress, children }: SuggestionRowProps) {
  const row = useSuggestionRow();
  return (
    <Focusable
      label={label}
      autoFocus={row.autoFocus}
      disabled={disabled}
      onPress={() => {
        onPress();
        row.onPicked();
      }}
      sv={rowVariants}
      vars={{ active: false, led: lead !== null }}
    >
      {lead}
      <Box flex minW={0} gap={2}>
        {children}
      </Box>
    </Focusable>
  );
}

/** A row of a list of suggestions, in the presentation its field is in: an
 *  option driven from the entry, or a stop of the dialog. `lead` is the mark
 *  at its head, or null for none. */
function SuggestionRow({ field, ...props }: SuggestionRowProps & { field: SuggestingField }) {
  return field.presentation === 'dialog' ? <DialogRow {...props} /> : <PanelRow {...props} />;
}

function Marked({ text, query }: Readonly<{ text: string; query: string }>) {
  const slots = useSv(rowVariants)({ active: false });
  return (
    <Text variant="body" lines={1} style={slots.label}>
      {textRuns(text, matchText(text, query)).map((run) =>
        run.hit ? (
          <Text key={run.at} variant="body" color="accentText" style={slots.label}>
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </Text>
  );
}

interface ItemParts {
  part: string;
  Media: unknown;
  Hint: unknown;
}

/** One suggestion: a name the list offers, with the letters the query found
 *  marked. A press picks it, and its `Media` goes with it. `parts` names the
 *  field's own `Item`, `Media` and `Hint`. */
function SuggestionItem({
  value,
  disabled,
  children,
  parts,
}: Readonly<SuggestionItemShape & { parts: ItemParts }>) {
  const field = useSuggesting(parts.part);
  const [media, hints] = sortParts(children, parts.Media, parts.Hint);
  const face = media.length > 0 ? media : null;
  const corner = rowMediaCorner(useStyleScope());
  const place = useMemo(
    () => ({ name: value, size: field.rowMedia, corner }),
    [value, field.rowMedia, corner],
  );
  return (
    <SuggestionRow
      field={field}
      label={value}
      lead={face === null ? null : <MediaPlaceContext value={place}>{face}</MediaPlaceContext>}
      disabled={disabled}
      onPress={() => field.pick(value, face)}
    >
      <Marked text={value} query={field.query} />
      {hints}
    </SuggestionRow>
  );
}

/** The row that says suggestions are on their way. */
function LoadingRow() {
  const t = useTDefault();
  return (
    <Box row align="center" gap={10} px={12} py={10}>
      <Spinner size={16} />
      <Text variant="meta" color="textDim">
        {t('tagField.searching')}
      </Text>
    </Box>
  );
}

const sDefinition = styles({
  keyed: { ring: 'focusInside' },
  disabled: { opacity: 0.4 },
});

export type { ItemParts };
export { LoadingRow, SuggestionItem, SuggestionRow };
