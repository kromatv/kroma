// @kroma/workbench: a component atelier, and the SDK for the stories it shows.
//
// Storybook's shape - explorer, canvas, toolbar, addons panel - with none of
// Storybook's machinery: no manager UI, no iframe protocol, no builder
// abstraction, no addon API. It does not host your components inside its own
// tree; it IS a screen built out of the same components, which is why it runs in
// a browser, on a television and on a phone alike.
//
// It knows no app. Three seams make that true:
//
//   stories  a PROP. Discovery needs a bundler primitive resolved relative to
//            the file that writes it, so the registry belongs to the package
//            whose stories are being globbed. `attachTiers`, `orderStories` and
//            `attachDemos` are the pieces you build one out of.
//   brand    a SLOT. This package has no design system of its own to be the
//            logo of, so it draws whatever you hand it - and nothing otherwise.
//   lenses   the toolbar's built-in menus act on the canvas, which is ours. A
//            switch acting on the app inside the canvas is yours to declare.
//
// The story SDK lives here too (`story()`, `sv`-derived controls, scenes, demos,
// prop docs), because a story format shipped separately from the tool that reads
// it is two versions to keep in step.
//
// WHAT IS NOT HERE. The sidebar, the toolbar, the panel, the palette, the canvas
// frames and their several dozen helpers are the workbench's own parts, not its
// API: a host mounts `Workbench` (or, far more likely, `defineWorkbench`) and
// never assembles one out of pieces. Exporting the pieces would make every
// rename inside this package a breaking change and would leave nothing able to
// tell you when a helper died. Their unit tests import them from their own
// modules, which is what a test of an internal should do.

// ---- mounting one ----
export type { ProviderSpec, WorkbenchDefinition } from './define';
export { defineWorkbench } from './define';
// ---- building the registry it reads ----
//
// Two halves: `discover*` for the ordinary case (a bundler glob, one call), and
// the `attach*`/`order*` functions for a host that has its stories some other
// way and needs to level, group and sort them itself.
export type { DemoFile, DiscoveredDemo } from './demos';
export { attachDemos } from './demos';
export type { Context, GlobHost, Modules, PropDocs, Sources } from './discover';
export { discoverMetro, discoverVite } from './discover';
export type { PropDoc } from './props';
// ---- where it puts the address bar ----
export type { Navigate, View, WorkbenchLocation, WorkbenchRouter } from './router';
export { memoryRouter, pathRouter, searchParamsRouter } from './router';
// ---- the story SDK ----
//
// Everything a host needs to AUTHOR a story and to reason about one it has.
// `story()` is the whole authoring surface.
export type {
  Control,
  ControlSpec,
  DemoDef,
  MatrixRow,
  ResolvedControl,
  Scene,
  Story,
  StoryDef,
} from './story';
export {
  attachTiers,
  GROUP_ORDER,
  matches,
  orderStories,
  slug,
  story,
  TIER_ORDER,
  tierFor,
} from './story';
// ---- what a host declares to extend the chrome ----
export type { Choice, ToolbarLens } from './toolbar';
export type { WorkbenchProps } from './workbench';
export { Workbench } from './workbench';
