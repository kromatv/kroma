// The contract between <Select>'s trigger and its open options (see
// ./select-options).

import type { ReactElement, RefObject } from 'react';
import type { View } from 'react-native';
import type { SurfacePresentation } from '#ui/lib/surface-presentation';
import type { SelectDismissReason, SelectOption } from './select-context';

export type SelectPresentation = SurfacePresentation;

export interface SelectSurfaceProps {
  open: boolean;
  presentation: SelectPresentation;
  label: string | undefined;
  options: readonly SelectOption[];
  items: readonly ReactElement[];
  value: string;
  onPick: (next: string) => void;
  onDismiss: (reason: SelectDismissReason) => void;
  anchor: RefObject<View | null>;
}
