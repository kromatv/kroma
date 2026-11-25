import { Children, isValidElement, type ReactNode } from 'react';
import { PanelIndexContext, SeamIndexContext } from './resizable-context';
import { Handle } from './resizable-handle.component';
import type { PanelSpec } from './resizable-layout';
import { Panel } from './resizable-panel';

export interface Parts {
  specs: PanelSpec[];
  seams: number;
  nodes: ReactNode[];
}

/** The group's direct children, each panel and seam wrapped in the index it
 *  takes, with the panels' specs and the number of seams. */
export function resizableParts(children: ReactNode): Parts {
  const specs: PanelSpec[] = [];
  let seams = 0;
  // `Children.toArray` has already given every child a stable key of its own,
  // which is what the providers wrap themselves in: an index would renumber the
  // panels the moment a window crossing a breakpoint drops one.
  const nodes = Children.toArray(children).map((child) => {
    if (!isValidElement<PanelSpec>(child)) {
      return child;
    }
    if (child.type === Panel) {
      const at = specs.length;
      specs.push(child.props);
      return (
        <PanelIndexContext key={child.key} value={at}>
          {child}
        </PanelIndexContext>
      );
    }
    if (child.type === Handle) {
      seams += 1;
      return (
        <SeamIndexContext key={child.key} value={specs.length - 1}>
          {child}
        </SeamIndexContext>
      );
    }
    return child;
  });
  return { specs, seams, nodes };
}
