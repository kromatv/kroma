import { isValidElement, type ReactNode } from 'react';

/**
 * The first plain text under a node, at whatever depth it sits: what a compound
 * reads off its children to name itself to assistive tech. Deliberately not a
 * type check against a Label part: a component composing the row writes a label
 * part of its own (<ChoiceList.Label>), and the row still has to name itself.
 */
function nameOf(node: ReactNode): string | undefined {
  if (typeof node === 'string') return node || undefined;
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const found = nameOf(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  return nameOf((node.props as { children?: ReactNode }).children);
}

export { nameOf };
