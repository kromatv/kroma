import type { FocusHolder } from '../focus-holder';

/** What the reader needs of a mounted anchor: the instance, which leads to its
 *  tree, and the focus holder of the provider that rendered it. */
export type MountedAnchor = { readonly props: Readonly<{ focus: FocusHolder }> };

/** The anchor of every mounted `KitProvider`, the reader's only way into the trees. */
export const mountedAnchors = new Set<MountedAnchor>();
