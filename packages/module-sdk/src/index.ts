// The frontend module contract. A module package imports its types from here
// and exports a `KromaModule`; it depends on no other @kroma package, so the
// re-exports below are that facade.

export * from '@kroma/admin-kit';
export type {
  ClientTestResult,
  DownloadClientView,
  DownloadView,
  EngineCapability,
  IndexerDefinitionDetailView,
  IndexerDefinitionView,
  IndexerTestResult,
  IndexerView,
  ManualReleaseView,
  MessageKey,
  RemoteAccessView,
  SaveDownloadClientBody,
  SaveIndexerBody,
  TorrentAnalysis,
  TorrentFileView,
  VpnTestResult,
} from '@kroma/core';
// The SSE client is renamed to avoid colliding with the SDK's own `KromaEvents`
// event-map interface.
export { apiErrorText, KromaEvents as KromaEventStream } from '@kroma/core';
export { useT } from '@kroma/ui';
export { EmptyState } from '@kroma/ui/kit';
export type { EventBus, EventKey } from './bus';
export { createEventBus } from './bus';
export type { KromaEvents, ModuleApiRegistry } from './contracts';
export type { DefineModuleOptions, ModuleManifestInput, ModulePage } from './define';
export { defineModule, pageHref } from './define';
export type { HostApi, HostAuth, HostBase, HostI18n, HostNav, KromaHost } from './host';
export { moduleIconUrl } from './icon';
export type {
  KromaModule,
  ModuleComponentProps,
  NavItem,
  RouteDef,
  SettingsPanel,
} from './module';
export type { ModuleNav, ModulePanel, ModuleRoute, ModuleStatus } from './registry';
export { depEntries, ModuleRegistry } from './registry';
export type {
  Capability,
  CapabilityReq,
  ConfigField,
  Dependencies,
  Dependency,
  DependencyMap,
  FeRemote,
  ModuleManifest,
} from './types';
