import { createContext, type ReactNode, useContext } from 'react';

interface DefaultFocusProps {
  children: ReactNode;
  /** Default true, so the marker can be left in place and switched off. */
  enable?: boolean;
}

const DefaultFocusContext = createContext(false);

/**
 * Where the focus opens. Every focusable descendant claims it as it mounts and
 * the first claim wins; a claim made before the tree is registered is held
 * until it is, and one made after something else took the focus is dropped.
 */
function DefaultFocus({ children, enable = true }: Readonly<DefaultFocusProps>) {
  return <DefaultFocusContext.Provider value={enable}>{children}</DefaultFocusContext.Provider>;
}

function useDefaultFocus(): boolean {
  return useContext(DefaultFocusContext);
}

export type { DefaultFocusProps };
export { DefaultFocus, useDefaultFocus };
