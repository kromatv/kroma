import { createContext, type ReactNode, useContext } from 'react';
import type { Radius } from '#ui/core/tokens';
import type { ResolvedPresentation } from '#ui/lib/surface-presentation.hook';

/** What a suggestion reads from the field that offers it. */
interface SuggestingField {
  query: string;
  rowMedia: number;
  presentation: ResolvedPresentation;
  pick: (name: string, face: ReactNode) => void;
}

const SuggestingContext = createContext<SuggestingField | null>(null);

/** The field around a suggestion. `part` is the part asking, as a caller
 *  writes it (`TagField.Item`), and names the Root it must sit in. */
function useSuggesting(part: string): SuggestingField {
  const field = useContext(SuggestingContext);
  if (!field) {
    const [namespace] = part.split('.');
    throw new Error(`<${part}> must be used inside <${namespace}.Root>`);
  }
  return field;
}

interface SuggestionRowState {
  nativeID?: string;
  active: boolean;
  keyed: boolean;
  autoFocus?: boolean;
  onHoverIn?: () => void;
  onPicked: () => void;
  onLayout?: (y: number, height: number) => void;
}

const IDLE_ROW: SuggestionRowState = { active: false, keyed: false, onPicked: () => undefined };

const SuggestionRowContext = createContext<SuggestionRowState>(IDLE_ROW);

function useSuggestionRow(): SuggestionRowState {
  return useContext(SuggestionRowContext);
}

interface MediaPlace {
  name: string;
  size: number;
  corner?: Radius;
}

const MediaPlaceContext = createContext<MediaPlace>({ name: '', size: 20 });

function useMediaPlace(): MediaPlace {
  return useContext(MediaPlaceContext);
}

export type { SuggestingField, SuggestionRowState };
export {
  MediaPlaceContext,
  SuggestingContext,
  SuggestionRowContext,
  useMediaPlace,
  useSuggesting,
  useSuggestionRow,
};
