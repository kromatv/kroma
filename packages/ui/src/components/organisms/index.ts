// The ORGANISMS: a whole, recognisable section of an interface.
//
// Where a molecule is one arrangement (a card, a labelled field), an organism is
// a REGION: it composes molecules and atoms, it usually owns behaviour of its
// own, and a screen is built by placing a few of them. A rail scrolls and
// windows its children; a dialog takes the remote hostage and declares a focus
// scope; the perf HUD samples frames. None of that is styling.
//
// The test for adding one: would a designer point at it and call it a part of
// the page, rather than a control on the page?

export type { ConfirmDialogProps, DialogProps } from './dialog';
export { ConfirmDialog, Dialog, DialogFooter } from './dialog';
export type { KromaIntroProps } from './kroma-intro';
export { KromaIntro } from './kroma-intro';
export { PerfHud } from './perf-hud';
export type { RailProps } from './rail';
export { Rail } from './rail';
export type { VirtualGridProps, VirtualRailProps } from './virtual';
export { VirtualGrid, VirtualRail } from './virtual';
