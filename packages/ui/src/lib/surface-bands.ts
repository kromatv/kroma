import { isValidElement, type ReactNode } from 'react';
import { directChildren } from './parts';

interface SurfaceParts {
  header: unknown;
  panel: unknown;
  footer: unknown;
}

interface SurfaceBands {
  header: ReactNode;
  panel: ReactNode;
  footer: ReactNode;
  /** Everything that claimed no band, which a Root hands to the panel it draws
   *  for itself. */
  loose: ReactNode[];
  /** How many children claimed no band beside a panel the caller wrote. A Root
   *  draws a panel of its own only when it was given none, so these are not drawn. */
  unplaced: number;
}

/**
 * The three bands of an overlay surface, taken from its DIRECT children.
 * Yoga has no `order` and a container cannot read its own subtree, so a Root
 * that wants its header pinned above a scrolling panel sorts what it was given
 * (see DESIGN.md §2). <Dialog> and <Drawer> are both this.
 *
 * A band holding nothing is not a band: a surface whose footer is written
 * around a condition draws no shelf on the pass where the condition is false.
 */
function surfaceBands(children: ReactNode, parts: Readonly<SurfaceParts>): SurfaceBands {
  const kids = directChildren(children).filter((node) => !isEmptyBand(node, parts));
  const find = (which: unknown) => kids.find((node) => isValidElement(node) && node.type === which);
  const header = find(parts.header);
  const panel = find(parts.panel);
  const footer = find(parts.footer);
  const loose = kids.filter((node) => node !== header && node !== panel && node !== footer);
  return { header, panel, footer, loose, unplaced: panel ? loose.length : 0 };
}

function isEmptyBand(node: ReactNode, parts: Readonly<SurfaceParts>): boolean {
  if (!isValidElement(node)) {
    return false;
  }
  const band =
    node.type === parts.header || node.type === parts.panel || node.type === parts.footer;
  if (!band) {
    return false;
  }
  const { children } = node.props as { children?: ReactNode };
  return directChildren(children).length === 0;
}

export type { SurfaceBands };
export { surfaceBands };
