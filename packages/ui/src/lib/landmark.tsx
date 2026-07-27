// The page landmark, native (Apple TV / Android TV): there is none.
//
// `<main>` is a DOM affordance: it tells assistive tech and Lighthouse where a
// page's content begins. A native TV has no equivalent - VoiceOver and TalkBack
// read the view tree itself - and React Native has no host component by that
// name, so rendering one is not a no-op but a hard crash ("View config getter
// callback for component `main` must be a function"). The children ARE the
// content here, so the wrapper simply disappears. See landmark.web.tsx for the
// browser half, which is where the element belongs.

import type { ReactNode } from 'react';

export const PageMain = ({ children }: { children: ReactNode }) => <>{children}</>;
