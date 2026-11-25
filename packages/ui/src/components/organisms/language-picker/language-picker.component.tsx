import { localeChoices, searchLocales, sortLocales } from '@kromatv/core';
import { deviceLanguageTags, type OfferedLocale } from '@kromatv/i18n';
import { type ReactNode, useContext, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { selectTriggerVariants } from '#ui/components/molecules/select';
import { useControl } from '#ui/lib/control';
import { CONTROL, type ControlSize, useEntryDefaults } from '#ui/lib/field-shell';
import { useLocaleDefault, useTDefault } from '#ui/services/i18n';
import {
  type LanguagePickerDetails,
  LanguagePickerContext,
  type LanguagePickerState,
  useLanguagePicker,
  ValueInkContext,
} from './language-picker-context';
import { languagePickerControl } from './language-picker-control';
import { LanguagePickerDialog } from './language-picker-dialog.component';
import { Input } from './language-picker-input.component';
import { Empty, List, Mark } from './language-picker-list.component';

const LONG_LIST = 8;

interface LanguagePickerRootProps<L extends string> {
  /** The languages on offer, as `LOCALES` lists them: each one's code, its own
   *  name and its stage. A `beta` one wears a tag. */
  locales: readonly OfferedLocale<L>[];
  /** `null` while none is picked, as is a code no locale has. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (next: L, details: LanguagePickerDetails) => void;
  open?: boolean;
  defaultOpen?: boolean;
  /** `details.reason` says what opened or closed the dialog: `trigger`,
   *  `select`, `back` or `outside`. */
  onOpenChange?: (open: boolean, details: LanguagePickerDetails) => void;
  /** Names the list to assistive tech and titles the dialog. */
  label: string;
  /** The languages the device asks for, most wanted first, as BCP 47 tags.
   *  Defaults to the browser's; a native shell passes its platform's. */
  preferred?: readonly string[];
  /** The control shell's size, for the trigger and the rows. Defaults to the
   *  app's (`KitProvider`). */
  size?: ControlSize;
  /** A `<LanguagePicker.Trigger>` that opens the list in a dialog, or the
   *  `<LanguagePicker.Input>`, `.List` and `.Empty` laid out in place. The
   *  Root draws no element, so its parts may sit in different bands. */
  children?: ReactNode;
}

function useChoices(locales: readonly OfferedLocale<string>[]) {
  const t = useTDefault();
  const locale = useLocaleDefault();
  return useMemo(() => sortLocales(localeChoices(locales, t), locale), [locales, t, locale]);
}

function usePickerControl<L extends string>(props: Readonly<LanguagePickerRootProps<L>>) {
  const { locales } = props;
  const [control] = useControl(languagePickerControl, {
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: (next: string | null, details: LanguagePickerDetails) => {
      const picked = locales.find((locale) => locale.code === next);
      if (picked) {
        props.onValueChange?.(picked.code, details);
      }
    },
    open: props.open,
    defaultOpen: props.defaultOpen,
    onOpenChange: props.onOpenChange,
  });
  return control;
}

function useListFacts(locales: readonly OfferedLocale<string>[], query: string) {
  const { physicalKeyboard } = useEntryDefaults();
  const choices = useChoices(locales);
  const long = choices.length > LONG_LIST;
  const searchable = long && physicalKeyboard;
  const typed = searchable ? query.trim() : '';
  const matches = useMemo(() => (typed ? searchLocales(choices, typed) : null), [choices, typed]);
  return useMemo(
    () => ({ choices, long, searchable, matches }),
    [choices, long, searchable, matches],
  );
}

function usePickerState<L extends string>(
  props: Readonly<LanguagePickerRootProps<L>>,
): LanguagePickerState {
  const { value, open, setOpen, query, setQuery, trigger, select } = usePickerControl(props);
  const list = useListFacts(props.locales, query);
  const fallbackSize = useEntryDefaults().size;
  const { label, preferred, size = fallbackSize } = props;
  const device = preferred ?? deviceLanguageTags();
  return useMemo(
    () => ({
      ...list,
      value,
      open,
      setOpen,
      query,
      setQuery,
      trigger,
      select,
      label,
      size,
      device,
      entry: false,
    }),
    [list, value, open, setOpen, query, setQuery, trigger, select, label, size, device],
  );
}

function Root<L extends string>(props: Readonly<LanguagePickerRootProps<L>>) {
  const state = usePickerState(props);
  return (
    <LanguagePickerContext value={state}>
      {props.children}
      {state.open ? <LanguagePickerDialog state={state} /> : null}
    </LanguagePickerContext>
  );
}

interface LanguagePickerTriggerProps extends Omit<
  FocusableProps,
  'children' | 'sv' | 'vars' | 'label' | 'expanded' | 'onPress' | 'style'
> {
  /** Stretch to the width of the parent. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The control that opens the list: the picked language's flag and its own
 *  name, in the well a `<Select.Trigger>` wears, so the two line up in a form. */
function Trigger({ block = false, style, ...focusProps }: Readonly<LanguagePickerTriggerProps>) {
  const { label, value, choices, size, open, trigger } = useLanguagePicker('Trigger');
  const picked = choices.find((choice) => choice.code === value);
  return (
    <Focusable
      {...focusProps}
      expanded={open}
      label={picked ? `${label}: ${picked.endonym}` : label}
      onPress={() => trigger()}
      sv={selectTriggerVariants}
      vars={{ size, invalid: false, filled: true, block }}
      style={style}
    >
      {(state) => (
        <>
          <ValueInkContext value={state.slots.ink}>
            <Value />
          </ValueInkContext>
          <Box flex />
          <Icon name="chevron-down" size={16} color="textDim" />
        </>
      )}
    </Focusable>
  );
}

/** The picked language: its flag and its own name, written in that language.
 *  The trigger draws it; write it yourself to report the pick elsewhere, such
 *  as at the end of a settings row that opens the list. */
function Value() {
  const { value, choices, size } = useLanguagePicker('Value');
  const ink = useContext(ValueInkContext);
  const picked = choices.find((choice) => choice.code === value);
  if (!picked) {
    return null;
  }
  return (
    <Box row align="center" gap={CONTROL[size].gap} shrink={1} minW={0}>
      <Mark code={picked.code} size={size} />
      <Text variant={size === 'tv' ? 'labelTv' : 'body'} lines={1} lang={picked.code} style={ink}>
        {picked.endonym}
      </Text>
    </Box>
  );
}

/**
 * The interface language, picked from a list that holds ten languages or
 * forty. Each row is one control: the language's flag, its own name written in
 * it, its name in the language on screen, a tag while it is in beta, and a tick
 * on the one picked. A long list leads with the few a reader most likely wants
 * and searches by either name or the code where there is a keyboard.
 *
 * ```tsx
 * <LanguagePicker.Root locales={LOCALES} value={locale} onValueChange={setLocale} label="Language">
 *   <LanguagePicker.Trigger />
 * </LanguagePicker.Root>
 *
 * <LanguagePicker.Root locales={LOCALES} value={locale} onValueChange={setLocale} label="Language">
 *   <GuidedFlow.Header><LanguagePicker.Input /></GuidedFlow.Header>
 *   <GuidedFlow.Panel><LanguagePicker.List /><LanguagePicker.Empty /></GuidedFlow.Panel>
 * </LanguagePicker.Root>
 * ```
 */
const LanguagePicker = { Root, Trigger, Value, Input, List, Empty };

export type { LanguagePickerReason } from './language-picker-context';
export type { LanguagePickerDetails, LanguagePickerRootProps, LanguagePickerTriggerProps };
export { LanguagePicker };
