import { type ReactNode, useMemo } from 'react';
import {
  type EnclosedEntry,
  useEnclosedEntry,
} from '#ui/components/organisms/suggestions/enclosed-entry.hook';
import { type EntryMetrics, markCorner } from '#ui/components/organisms/suggestions/entry-metrics';
import { useSuggestingField } from '#ui/components/organisms/suggestions/suggesting-field.hook';
import {
  MediaPlaceContext,
  SuggestingContext,
} from '#ui/components/organisms/suggestions/suggestion-context';
import { SuggestionPanel } from '#ui/components/organisms/suggestions/suggestion-panel.component';
import {
  type SuggestionSurface,
  suggestionList,
  surfaceEntry,
} from '#ui/components/organisms/suggestions/suggestion-surface';
import { writtenParts } from '#ui/components/organisms/suggestions/suggestions-of';
import { useStyleScope } from '#ui/core';
import { useControl } from '#ui/lib/control';
import type { ControlSize } from '#ui/lib/field-shell';
import { partsOf } from '#ui/lib/parts';
import type { SurfacePresentation } from '#ui/lib/surface-presentation.hook';
import { comboboxControl, type ComboboxDetails } from './combobox-control';
import { ComboboxDialog } from './combobox-dialog.component';
import { Empty, Hint, Item, Media, Value } from './combobox-parts.component';

export type { ComboboxDetails, ComboboxReason } from './combobox-control';
export type {
  ComboboxItemProps,
  ComboboxMediaProps,
  ComboboxValueProps,
} from './combobox-parts.component';

interface ComboboxRootProps {
  /** Defaults to the <Field.Root>'s label, then to the placeholder; nothing draws it. */
  label?: string;
  /** What is typed, as it is typed, or the name of the suggestion picked. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string, details: ComboboxDetails) => void;
  /** Typing opens the suggestions and a pick closes them; they draw only with something to show. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: ComboboxDetails) => void;
  /** No default: the product is not in this file's language. */
  placeholder?: string;
  /** Defaults to true; false keeps a search's results unmatched, in the order written. */
  filter?: boolean;
  /** Draws a row saying suggestions are on their way, in the place of <Combobox.Empty>. */
  loading?: boolean;
  /** The shell's step: the <Field.Root>'s around it, else the app's (`KitProvider`). */
  size?: ControlSize;
  /** Defaults to the <Field.Root>'s around it, which its `error` turns on. */
  invalid?: boolean;
  disabled?: boolean;
  /** Defaults to `auto`: a dialog under a D-pad, a list under the entry under a pointer. */
  presentation?: SurfacePresentation;
  /** <Combobox.Value>s, <Combobox.Item>s and a <Combobox.Empty>, as DIRECT children. */
  children?: ReactNode;
}

type ResolvedProps = EnclosedEntry<ComboboxRootProps>;

const LIST_PARTS = { Item, Media, Empty };

const NO_NAMES: readonly string[] = [];

function faceOf(children: ReactNode, name: string, faces: ReadonlyMap<string, ReactNode>) {
  const written = partsOf(children, Value).find((part) => part.props.value === name);
  const declared = written ? writtenParts(written.props.children, Media) : null;
  return declared ?? faces.get(name) ?? null;
}

function useLead(name: string, face: ReactNode, metrics: EntryMetrics): ReactNode {
  const corner = markCorner(metrics, useStyleScope());
  const size = metrics.mark;
  const place = useMemo(() => ({ name, size, corner }), [name, size, corner]);
  return face === null ? null : <MediaPlaceContext value={place}>{face}</MediaPlaceContext>;
}

function useSurface(props: Readonly<ResolvedProps>) {
  const [control] = useControl(comboboxControl, props);
  const { value, pick, setOpen } = control;
  const { field, faces, metrics } = useSuggestingField({ ...props, query: value, take: pick });
  const list = suggestionList(props.children, LIST_PARTS, {
    ...props,
    value: NO_NAMES,
    query: value,
  });
  const onNone = () => setOpen(false, 'commit');
  const entry = surfaceEntry(control, { text: value, closed: false, onNone });
  const surface: SuggestionSurface = { field, metrics, look: props, entry, list };
  const lead = useLead(value, faceOf(props.children, value, faces), metrics);
  return { surface, lead };
}

/** Owns one name and whether its suggestions are open, and draws the entry:
 *  what is typed is the value, and a suggestion picked replaces it with its
 *  name and its face, drawn at the start of the entry. Under a pointer the
 *  suggestions hang under the entry and the keys run from it; under a D-pad
 *  the entry is one stop that opens a dialog with the keyboard. Wear it inside
 *  a <Field.Root>, which draws the label row and the <Field.Hint> and lends it
 *  its label, its error and its size. */
function Root(props: Readonly<ComboboxRootProps>) {
  const { surface, lead } = useSurface(useEnclosedEntry(props));
  return (
    <SuggestingContext value={surface.field}>
      {surface.field.presentation === 'dialog' ? (
        <ComboboxDialog surface={surface} lead={lead} />
      ) : (
        <SuggestionPanel surface={surface} lead={lead} filled={lead !== null} single />
      )}
    </SuggestingContext>
  );
}

const Combobox = { Root, Value, Item, Media, Hint, Empty };

export type { ComboboxRootProps };
export { Combobox };
