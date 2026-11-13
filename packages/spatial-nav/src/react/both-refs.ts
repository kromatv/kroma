import type { Ref } from 'react';

/** One ref that hands a node to both `first` and `second`. */
export function bothRefs<T>(
  first: Ref<T> | undefined,
  second: Ref<T> | undefined,
): Ref<T> | undefined {
  if (!first) return second;
  if (!second) return first;
  return (node: T | null) => {
    for (const ref of [first, second]) {
      if (typeof ref === 'function') ref(node);
      else ref.current = node;
    }
  };
}
