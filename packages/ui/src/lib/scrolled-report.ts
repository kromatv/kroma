import { createContext } from 'react';

/** Where the nearest page scroller reports leaving or returning to its start, when it has no `onScrolledChange` of its own. */
export const ScrolledReport = createContext<((scrolled: boolean) => void) | null>(null);
