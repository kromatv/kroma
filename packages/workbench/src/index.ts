// @kroma/workbench: a component atelier, and the SDK for the stories it shows.
//
// A host mounts `Workbench` (or `defineWorkbench`); the sidebar, toolbar, panel
// and canvas frames are internal and deliberately not exported.

export type { ProviderSpec, WorkbenchDefinition } from './define';
export { defineWorkbench } from './define';
export type { DemoFile, DiscoveredDemo } from './demos';
export { attachDemos } from './demos';
export type { Context, GlobHost, Modules, PropDocs, Sources } from './discover';
export { discoverMetro, discoverVite } from './discover';
export type { PropDoc } from './props';
export type { Navigate, View, WorkbenchLocation, WorkbenchRouter } from './router';
export { memoryRouter, pathRouter, searchParamsRouter } from './router';
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
export type { Choice, ToolbarLens } from './toolbar';
export type { WorkbenchProps } from './workbench';
export { Workbench } from './workbench';
