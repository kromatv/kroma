import { createContext, type RefObject } from 'react';
import { type View } from 'react-native';

type Anchor = RefObject<View | null>;

const PageScrollContext = createContext<((anchor: Anchor) => void) | null>(null);

const RowContext = createContext<Anchor | null>(null);

const RailScrollContext = createContext<((anchor: Anchor) => void) | null>(null);

export type { Anchor };
export { PageScrollContext, RailScrollContext, RowContext };
