// <Field>: the entry. THE entry - there is no second one to choose between.
//
// This is the only text-input component in the kit's public surface. <TextField>
// still exists behind it as the control Field renders, but it is an
// implementation detail rather than a thing to pick: a screen that reaches past
// the label, the hint and the error-replaces-hint rule tends to lose them, and
// the two components sitting side by side in the barrel made "which one?" a
// decision every form had to make and could get wrong.
//
// What the molecule owns is the arrangement the design specifies, plus the one
// rule worth enforcing centrally: an error REPLACES the hint rather than
// stacking under it. Two lines of small text under a field is how a form starts
// looking broken.
//
// The common case is one line:
//
//   <Field label="Email" type="email" icon="mail" onChange={setEmail} />
//
// A paragraph is the same field, told how many lines to open at. It grows with
// what is typed into it, so nobody writes a note through a slot:
//
//   <Field label="Message" multiline rows={3} onChange={setBody} />
//
// A control that is not a text entry goes in as children, and the label, hint
// and error still apply:
//
//   <Field label="PIN" error={wrong ? 'Incorrect PIN' : undefined}>
//     <PinField onComplete={verify} />
//   </Field>
//
// And a bare entry with no visible label - a search box in a header, a filter -
// is `hideLabel`. The label is still REQUIRED there and still reaches the
// platform as the accessible name; hiding it is a visual decision, never
// permission to ship an unnamed input.

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
  /** Names the control. Always required - with `hideLabel` it stops being drawn
   *  but still reaches the platform as the accessible name. */
  label: string;
  /** Draw no label row. For an entry whose purpose is obvious from position and
   *  glyph (a header search box, a filter), where a label above would be noise. */
  hideLabel?: boolean;
  /** What this is for, when the label alone is not enough. */
  hint?: string;
  /** What is wrong. Takes the hint's place and turns it red. */
  error?: string;
  /** A control other than a text entry: a Switch, a row of Chips, a PinField.
   *  Given children, the entry props below are ignored. */
  children?: ReactNode;

  // ---- the entry, rendered when no children are passed ----
  /** A paragraph rather than a line: renders the multi-line entry, which opens
   *  `rows` tall and grows with what is typed into it. `type` and `icon` do not
   *  apply to it (there is no keyboard to derive and no glyph slot). */
  multiline?: boolean;
  /** The multi-line entry's floor, in lines. */
  rows?: number;
  /** The multi-line entry's ceiling, in lines; past it the entry scrolls. */
  maxRows?: number;
  /** What the entry holds. `password` masks and grows the reveal eye. */
  type?: TextFieldType;
  /** Leading glyph inside the entry. */
  icon?: IconName;
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  /** True when the shell has a real keyboard. See <TextField>. */
  physicalKeyboard?: boolean;
  /** Explicit override; normally derived from `type`. */
  keyboardType?: NonNullable<TextFieldProps['keyboardType']>;
  /** Focus on mount. Off by default - a form that steals focus on render also
   *  summons the on-screen keyboard on a television. */
  autoFocus?: boolean;
  /** Control rendered after the entry, inside it: a Detect button, a mic. */
  trailing?: ReactNode;
  /**
   * Presentation of the entry itself, merged over the defaults.
   *
   * Box props on <Field> lay out the FIELD (its margin, its width); these reach
   * the entry (its height, fill, radius, type scale). The distinction is what
   * lets the 10-foot screens size a 68px search box without also inflating the
   * label above it - the thing they used to bypass Field entirely to do.
   */
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
    // One gap serves every row the field has. With `hideLabel` there is no label
    // row, so it simply spaces the entry from its note.
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
