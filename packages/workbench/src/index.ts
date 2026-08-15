// @kroma/workbench: a component atelier, and the SDK for the stories it shows.
//
// A host mounts `Workbench` (or `defineWorkbench`); the sidebar, toolbar, panel
// and canvas frames are internal and deliberately not exported.

export type { ProviderSpec, WorkbenchDefinition } from './define';
export { defineWorkbench } from './define';
export type { DemoFile, DiscoveredDemo } from './demos';
export { attachDemos } from './demos';
export type { Control, ControlSpec, MatrixRow, ResolvedControl } from './derive';
export type { Context, GlobHost, Modules, PropDocs, Sources } from './discover';
export { discoverMetro, discoverVite } from './discover';
export type { Registry, StoryEntry } from './entry';
export { storyEntries, useStory } from './entry';
export type {
  HistoryCommit,
  HistoryEntry,
  HistoryRow,
  HistorySubject,
  KitHistory,
} from './history';
export type { LazyRegistry, Loaders, SourceLoaders } from './lazy';
export { indexVite } from './lazy';
export type { Block, Mark, Segment } from './markdown';
export { blocks, segments } from './markdown';
export { MDX_COMPONENTS, STORY_COMPONENTS } from './mdx';
export { DocFigure } from './mdx-blocks';
export type { Page, PageMeta, PageModule } from './page';
export { discoverPagesMetro, discoverPagesVite, orderPages, pageAt } from './page';
export { withPageHistory } from './page-history';
export type {
  PlayContext,
  PlayExpectation,
  PlayFunction,
  PlayStatus,
  PlayStep,
  PlayTranscript,
} from './play-types';
export type { PropDoc, PropSection } from './props';
export { RecentChanges } from './recent-changes';
export {
  attachTiers,
  GROUP_ORDER,
  matches,
  orderStories,
  slug,
  TIER_ORDER,
  tierFor,
} from './registry';
export type { Navigate, View, WorkbenchLocation, WorkbenchRouter } from './router';
export { memoryRouter, pathRouter, searchParamsRouter } from './router';
export type { PageRef, StorySource } from './source';
export type {
  ControlsRole,
  DemoDef,
  DocComponent,
  Scene,
  SceneDef,
  Story,
  StoryDef,
} from './story';
export { controlsRole, defineStory, story } from './story';
// The Scene/Do/Dont components themselves travel inside STORY_COMPONENTS; a
// bare `Scene` here would collide with the compiled scene's type above.
export type { StoryDocScope } from './story-blocks';
export { StoryDocContext } from './story-blocks';
export type { StoryCode, StoryCodes } from './story-code';
export type { StoryMdxModule } from './story-mdx';
export { storyFromMdx } from './story-mdx';
export type { Choice, ToolbarLens } from './toolbar';
export type { WorkbenchProps } from './workbench';
export { Workbench } from './workbench';
