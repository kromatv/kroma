// The kit's only text entry: a label, a control and a note, where an error
// REPLACES the hint rather than stacking a second line under the field.
//
// Composed, in Radix's shape: a Root that owns the label, the shell size, the
// value and the invalid presentation, and parts that read all four through
// context. `Field.Input` and `Field.Textarea` are the doors to <TextField> and
// <TextArea>, which is why neither atom is exported.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { TextArea, type TextAreaProps } from '#ui/components/atoms/text-area';
import { TextField, type TextFieldProps } from '#ui/components/atoms/text-field';
import type { ControlSize } from '#ui/lib/field-shell';
import { partContext } from '#ui/lib/part-context';
import { useControllable } from '#ui/lib/use-controllable';

interface FieldContext {
  label: string;
  invalid: boolean;
  error: string | undefined;
  size: ControlSize | undefined;
  value: string;
  setValue: (next: string) => void;
}

const [Context, useField] = partContext<FieldContext>('Field.Root');

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
  /** The shell size every part takes, defaulting to the app's (`setEntryDefaults`). */
  size?: ControlSize;
  /** What the field's entry binds to. A part with its own `value`,
   *  `defaultValue` or `onValueChange` holds its state instead. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string) => void;
  /** Without a control of its own, the field renders a <Field.Input>. A
   *  <Field.Hint> is sorted under the control, so both must be DIRECT children. */
  children?: ReactNode;
}

function Root({
  label,
  hideLabel = false,
  error,
  invalid = Boolean(error),
  size,
  value: valueProp,
  defaultValue = '',
  onValueChange,
  children,
  ...box
}: Readonly<FieldRootProps>) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
  const message = error || undefined;
  const field = useMemo<FieldContext>(
    () => ({ label, invalid, error: message, size, value, setValue }),
    [label, invalid, message, size, value, setValue],
  );
  const at = useMemo(() => sort(children), [children]);
  return (
    <Context.Provider value={field}>
      <Box gap={8} {...box}>
        {hideLabel ? null : (
          <Text variant="meta" color="textMuted">
            {label}
          </Text>
        )}
        {at.control.length > 0 ? at.control : <Input />}
        {at.note.length > 0 ? at.note : <Hint />}
      </Box>
    </Context.Provider>
  );
}

function sort(children: ReactNode): { control: ReactNode[]; note: ReactNode[] } {
  const at: { control: ReactNode[]; note: ReactNode[] } = { control: [], note: [] };
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === Hint) at.note.push(child);
    else at.control.push(child);
  }
  return at;
}

interface EntryValue {
  /** Held by the entry itself. Given none of the three, it binds to the Root's. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string) => void;
}

function useEntry(part: string, own: Readonly<EntryValue>) {
  const field = useField(part);
  const owned =
    own.value !== undefined || own.defaultValue !== undefined || own.onValueChange !== undefined;
  return {
    label: field.label,
    invalid: field.invalid,
    size: field.size,
    ...(owned
      ? { value: own.value, defaultValue: own.defaultValue, onValueChange: own.onValueChange }
      : { value: field.value, onValueChange: field.setValue }),
  };
}

interface FieldInputProps
  extends Omit<TextFieldProps, 'label' | 'invalid' | 'size' | 'onValueChange'>,
    EntryValue {}

/** The single-line entry. `type` wires the keyboard, the autofill and the
 *  masking; the label, the invalid tint and the shell size come from the Root. */
function Input({ value, defaultValue, onValueChange, ...props }: Readonly<FieldInputProps>) {
  const entry = useEntry('Input', { value, defaultValue, onValueChange });
  return <TextField {...props} {...entry} />;
}

interface FieldTextareaProps
  extends Omit<TextAreaProps, 'label' | 'invalid' | 'size' | 'onValueChange'>,
    EntryValue {}

/** The multi-line entry: it opens `rows` tall and grows to `maxRows`. One of its
 *  lines is one line of a <Field.Input>, so the two align in a form. */
function Textarea({ value, defaultValue, onValueChange, ...props }: Readonly<FieldTextareaProps>) {
  const entry = useEntry('Textarea', { value, defaultValue, onValueChange });
  return <TextArea {...props} {...entry} />;
}

/** The note under the control: the help text, or the Root's `error` in its
 *  place. Wherever it is written, it renders under the control. */
function Hint({ children }: Readonly<{ children?: ReactNode }>) {
  const { error } = useField('Hint');
  const note = error ?? children;
  if (!note) return null;
  return (
    <Text variant="meta" color={error ? 'danger' : 'textDim'}>
      {note}
    </Text>
  );
}

const Field = { Root, Input, Textarea, Hint };

export type { FieldInputProps, FieldRootProps, FieldTextareaProps };
export { Field };
