import { createContext, useContext } from 'react';

/**
 * The context a compound's Root publishes, and the hook its parts read it with.
 * `owner` is the part that provides it, written as a caller would: under
 * `partContext<SelectState>('Select.Root')`, `useSelect('Label')` outside a Root
 * throws `<Select.Label> must be used inside <Select.Root>`.
 */
function partContext<T>(owner: string) {
  const namespace = owner.split('.')[0];
  const Context = createContext<T | null>(null);
  const usePart = (part: string): T => {
    const state = useContext(Context);
    if (!state) throw new Error(`<${namespace}.${part}> must be used inside <${owner}>`);
    return state;
  };
  return [Context, usePart] as const;
}

export { partContext };
