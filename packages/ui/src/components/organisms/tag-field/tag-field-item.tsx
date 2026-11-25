import { type ReactNode, useMemo } from 'react';
import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Spinner } from '#ui/components/atoms/spinner';
import { Text } from '#ui/components/atoms/text';
import { styles, sv, useSv } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { CONTROL } from '#ui/lib/field-shell';
import { sortParts } from '#ui/lib/parts';
import { matchText, textRuns } from '#ui/lib/text-match';
import { useTDefault } from '#ui/services/i18n';
import { MediaPlaceContext, useTagField, useTagFieldRow } from './tag-field-context';
import { Hint, Media } from './tag-field-parts.component';

interface TagFieldItemProps {
  /** The name a press adds, and the words the row draws. */
  value: string;
  disabled?: boolean;
  /** Its <TagField.Media> and <TagField.Hint>, which must be DIRECT children. */
  children?: ReactNode;
}

const rowVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 12,
      px: 10,
      py: 6,
      minH: 44,
      radius: CONTROL.sm.radius,
      _hover: { bg: 'tint/8' },
    },
    label: { color: 'text', fontWeight: '500' },
  },
  variants: {
    active: { true: { root: { bg: 'tint/8' } } },
  },
  defaults: { active: false },
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
  const row = useTagFieldRow();
  const slots = useSv(rowVariants)({ active: row.active });
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
  const row = useTagFieldRow();
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
      vars={{ active: false }}
    >
      {lead}
      <Box flex minW={0} gap={2}>
        {children}
      </Box>
    </Focusable>
  );
}

/** A row of the list, in the presentation the field is in. */
function SuggestionRow(props: Readonly<SuggestionRowProps>) {
  const { presentation } = useTagField('Item');
  return presentation === 'dialog' ? <DialogRow {...props} /> : <PanelRow {...props} />;
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

/** The <TagField.Media> an item was written with, which its tag wears once
 *  it is added. */
function faceOf(props: Readonly<TagFieldItemProps>): ReactNode {
  const [media] = sortParts(props.children, Media);
  return media.length > 0 ? media : null;
}

/** One suggestion: a name the list offers, with the letters the query found
 *  marked. A press adds it, and its <TagField.Media> follows it into the tag
 *  unless a <TagField.Tag> for that name says otherwise. */
function Item({ value, disabled, children }: Readonly<TagFieldItemProps>) {
  const field = useTagField('Item');
  const [, hints] = sortParts(children, Media, Hint);
  const face = faceOf({ value, children });
  const size = field.metrics.rowMedia;
  const place = useMemo(() => ({ name: value, size }), [value, size]);
  const lead = <MediaPlaceContext value={place}>{face}</MediaPlaceContext>;
  return (
    <SuggestionRow
      label={value}
      lead={lead}
      disabled={disabled}
      onPress={() => field.pick(value, face)}
    >
      <Marked text={value} query={field.query} />
      {hints}
    </SuggestionRow>
  );
}

/** The row that adds what is typed, as it is typed. */
function FreeRow({ name, label }: Readonly<{ name: string; label: string }>) {
  const field = useTagField('Root');
  const size = field.metrics.rowMedia;
  return (
    <SuggestionRow
      label={label}
      lead={
        <Box w={size} h={size} center radius="circle" bg="tint/8">
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

export type { TagFieldItemProps };
export { faceOf, FreeRow, Item, LoadingRow };
