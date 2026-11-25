// The kit's only text entry: a label, a control and a note, where an error
// REPLACES the hint rather than stacking a second line under the field.
//
// Composed, in Radix's shape: a Root that owns the label, the shell size, the
// value and the invalid presentation, and parts that read all four through
// context. `Field.Input` and `Field.Textarea` are the doors to <TextField> and
// <TextArea>, which is why neither atom is exported.

import { type ReactNode, useContext, useMemo, useState } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { TextArea, type TextAreaProps } from '#ui/components/atoms/text-area';
import { TextField, type TextFieldProps } from '#ui/components/atoms/text-field';
import type { ChangeDetails } from '#ui/lib/control';
import type { ControlSize } from '#ui/lib/field-shell';
import { useGroupShape } from '#ui/lib/group-shape';
import { partContext } from '#ui/lib/part-context';
import { sortParts } from '#ui/lib/parts';

interface FieldContext {
  label: string;
  invalid: boolean;
  error: string | undefined;
  size: ControlSize | undefined;
  entry: EntryValue;
  setFocused: (focused: boolean) => void;
}

const [Context, useField] = partContext<FieldContext>('Field.Root');

/** What a control that is not one of Field's parts reads from the Root around it. */
type EnclosingField = Pick<FieldContext, 'label' | 'invalid' | 'size' | 'setFocused'>;

/** The <Field.Root> a control sits in, or null outside one: how a control the
 *  kit composes into a field takes its label, its error and its size. */
function useEnclosingField(): EnclosingField | null {
  return useContext(Context);
}

interface FieldRootProps extends Omit<BoxProps, 'children'> {
  /** Names the control to assistive tech, and heads the field unless `hideLabel`. */
  label: string;
  /** Drops the label ROW; the label still reaches the control as its name. */
  hideLabel?: boolean;
  /** Takes the <Field.Hint>'s place and marks the control invalid. Empty reads
   *  as none. */
  error?: string;
  /** Defaults to whether there is an `error`. */
  invalid?: boolean;
  /** The shell size every part takes, defaulting to the app's (`KitProvider`). */
  size?: ControlSize;
  /** What the field's entry binds to. A part with its own `value`,
   *  `defaultValue` or `onValueChange` holds its state instead. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string, details: ChangeDetails) => void;
  /** Without a control of its own, the field renders a <Field.Input>. A
   *  <Field.Hint> is sorted under the control and a <Field.Actions> into the
   *  label row, so each must be a DIRECT child. */
  children?: ReactNode;
}

function Root({
  label,
  hideLabel = false,
  error,
  invalid = Boolean(error),
  size,
  value,
  defaultValue,
  onValueChange,
  children,
  ...box
}: Readonly<FieldRootProps>) {
  const [focused, setFocused] = useState(false);
  const message = error || undefined;
  const field = useMemo<FieldContext>(
    () => ({
      label,
      invalid,
      error: message,
      size,
      entry: { value, defaultValue, onValueChange },
      setFocused,
    }),
    [label, invalid, message, size, value, defaultValue, onValueChange],
  );
  const [note, actions, control] = sortParts(children, Hint, Actions);
  const group = useGroupShape(focused);
  return (
    <Context value={field}>
      <Box gap={8} {...box} style={[group, box.style]}>
        <LabelRow label={hideLabel ? null : label} actions={actions} />
        {control.length > 0 ? control : <Input />}
        {note.length > 0 ? note : <Hint />}
      </Box>
    </Context>
  );
}

const ACTIONS_OVERHANG = -10;

function LabelRow({ label, actions }: Readonly<{ label: string | null; actions: ReactNode[] }>) {
  if (label === null && actions.length === 0) {
    return null;
  }
  return (
    <Box row align="center" justify="space-between" gap={12}>
      <Text variant="meta" color="textMuted">
        {label}
      </Text>
      {actions.length > 0 ? (
        <Box row align="center" gap={8} my={ACTIONS_OVERHANG}>
          {actions}
        </Box>
      ) : null}
    </Box>
  );
}

interface FocusHandlers {
  onFocus?: () => void;
  onBlur?: () => void;
}

interface EntryValue {
  /** Held by the entry itself. Given none of the three, it binds to the Root's. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string, details: ChangeDetails) => void;
}

function useEntry(part: string, own: Readonly<EntryValue>, focus?: FocusHandlers) {
  const field = useField(part);
  const { setFocused } = field;
  const { onFocus: ownFocus, onBlur: ownBlur } = focus ?? {};
  const onFocus = () => {
    setFocused(true);
    ownFocus?.();
  };
  const onBlur = () => {
    setFocused(false);
    ownBlur?.();
  };
  const owned =
    own.value !== undefined || own.defaultValue !== undefined || own.onValueChange !== undefined;
  return {
    label: field.label,
    invalid: field.invalid,
    size: field.size,
    onFocus,
    onBlur,
    ...(owned ? own : field.entry),
  };
}

interface FieldInputProps
  extends Omit<TextFieldProps, 'label' | 'invalid' | 'size' | 'onValueChange'>, EntryValue {}

/** The single-line entry. `type` wires the keyboard, the autofill and the
 *  masking; the label, the invalid tint and the shell size come from the Root. */
function Input({ value, defaultValue, onValueChange, ...props }: Readonly<FieldInputProps>) {
  const entry = useEntry(
    'Input',
    { value, defaultValue, onValueChange },
    { onFocus: props.onFocus, onBlur: props.onBlur },
  );
  return <TextField {...props} {...entry} />;
}

interface FieldTextareaProps
  extends Omit<TextAreaProps, 'label' | 'invalid' | 'size' | 'onValueChange'>, EntryValue {}

/** The multi-line entry: it opens `rows` tall and grows to `maxRows`. One of its
 *  lines is one line of a <Field.Input>, so the two align in a form. */
function Textarea({ value, defaultValue, onValueChange, ...props }: Readonly<FieldTextareaProps>) {
  const entry = useEntry(
    'Textarea',
    { value, defaultValue, onValueChange },
    { onFocus: props.onFocus, onBlur: props.onBlur },
  );
  return <TextArea {...props} {...entry} />;
}

/** The note under the control: the help text, or the Root's `error` in its
 *  place. Wherever it is written, it renders under the control. */
function Hint({ children }: Readonly<{ children?: ReactNode }>) {
  const { error } = useField('Hint');
  const note = error ?? children;
  if (!note) {
    return null;
  }
  return (
    <Text variant="meta" color={error ? 'danger' : 'textDim'}>
      {note}
    </Text>
  );
}

/** The field's own controls, at the end of its label row: a button that puts
 *  the value back, a link to where it comes from. */
function Actions({ children }: Readonly<{ children?: ReactNode }>) {
  return <>{children}</>;
}

const Field = { Root, Input, Textarea, Hint, Actions };

export type { EnclosingField, FieldInputProps, FieldRootProps, FieldTextareaProps };
export { Field, useEnclosingField };
