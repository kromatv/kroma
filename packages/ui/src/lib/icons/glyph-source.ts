// The only module that pulls the icons in at runtime, so it alone decides what
// ships: a TV build replaces this file with the same two exports built from only
// the names the source mentions (see packages/ui/bundler).

import * as Tabler from '@tabler/icons-react-native';

export const FALLBACK = Tabler.IconHelpCircle;

export * as EXPORTS from '@tabler/icons-react-native';
