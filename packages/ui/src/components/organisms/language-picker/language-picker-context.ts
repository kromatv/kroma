import type { LocaleChoice } from '@kromatv/core';
import { createContext } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import type { ChangeDetails, ControlOf, ReasonOf } from '#ui/lib/control';
import type { ControlSize } from '#ui/lib/field-shell';
import { partContext } from '#ui/lib/part-context';
import type { languagePickerControl } from './language-picker-control';

/** Why the value moved or the dialog opened or closed: `select` is a pick,
 *  `back` the remote's Back button or a phone's, `outside` a press beside the
 *  dialog, and `set` a setter called without a reason. */
type LanguagePickerReason = ReasonOf<typeof languagePickerControl>;

type LanguagePickerDetails = ChangeDetails<LanguagePickerReason>;

type LanguagePickerControl = ControlOf<typeof languagePickerControl>;

interface LanguagePickerState extends Pick<
  LanguagePickerControl,
  'value' | 'open' | 'setOpen' | 'query' | 'setQuery' | 'trigger' | 'select'
> {
  label: string;
  size: ControlSize;
  choices: readonly LocaleChoice[];
  matches: readonly LocaleChoice[] | null;
  long: boolean;
  searchable: boolean;
  device: readonly string[];
  entry: boolean;
}

const [LanguagePickerContext, useLanguagePicker] =
  partContext<LanguagePickerState>('LanguagePicker.Root');

const ValueInkContext = createContext<StyleProp<TextStyle>>(null);

export type { LanguagePickerDetails, LanguagePickerReason, LanguagePickerState };
export { LanguagePickerContext, useLanguagePicker, ValueInkContext };
