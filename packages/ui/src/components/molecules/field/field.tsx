// The kit's only text-input component: label, entry and note, where an error
// REPLACES the hint rather than stacking a second line under the field.

import type { ReactNode } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import type { IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { TextArea, type TextAreaProps } from '#ui/components/atoms/text-area';
import {
  TextField,
  type TextFieldProps,
  type TextFieldType,
} from '#ui/components/atoms/text-field';

interface FieldProps extends Omit<BoxProps, 'children' | 'onChange'> {
  label: string;
  /** Hides the label row; it still reaches the platform as the accessible name. */
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  /** Given children, the entry props below are ignored. */
  children?: ReactNode;

  multiline?: boolean;
  rows?: number;
  maxRows?: number;
  type?: TextFieldType;
  icon?: IconName;
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  physicalKeyboard?: boolean;
  /** Explicit override; normally derived from `type`. */
  keyboardType?: NonNullable<TextFieldProps['keyboardType']>;
  autoFocus?: boolean;
  trailing?: ReactNode;
  /** Box props on `<Field>` lay out the field; `entry` reaches the input itself. */
  entry?: Partial<TextFieldProps & TextAreaProps>;
}

function Field({
  label,
  hideLabel = false,
  hint,
  error,
  children,
  multiline = false,
  rows,
  maxRows,
  type,
  icon,
  value,
  defaultValue,
  onChange,
  onSubmit,
  placeholder,
  physicalKeyboard,
  keyboardType,
  autoFocus = false,
  trailing,
  entry,
  ...box
}: Readonly<FieldProps>) {
  const note = error ?? hint;
  return (
    <Box gap={8} {...box}>
      {hideLabel ? null : (
        <Txt variant="meta" color="textMuted">
          {label}
        </Txt>
      )}
      {children ??
        (multiline ? (
          <TextArea
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            placeholder={placeholder}
            rows={rows}
            maxRows={maxRows}
            physicalKeyboard={physicalKeyboard}
            autoFocus={autoFocus}
            invalid={Boolean(error)}
            label={label}
            py={12}
            {...entry}
          />
        ) : (
          <TextField
            type={type}
            icon={icon}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={placeholder}
            physicalKeyboard={physicalKeyboard}
            keyboardType={keyboardType}
            autoFocus={autoFocus}
            trailing={trailing}
            invalid={Boolean(error)}
            label={label}
            py={12}
            {...entry}
          />
        ))}
      {note ? (
        <Txt variant="meta" color={error ? 'danger' : 'textDim'}>
          {note}
        </Txt>
      ) : null}
    </Box>
  );
}

export type { FieldProps };
export { Field };
