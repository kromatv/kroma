// The frontend module contract. A module package imports its manifest types,
// host context, admin data hooks and event bus from here; the COMPONENTS it
// renders with come from `@kroma/ui/kit`, the one design system every KROMA
// surface shares.

export type {
  EngineContribution,
  KromaClient,
  MessageKey,
  ModuleApi,
  ServerEvent,
} from '@kroma/core';
// The SSE client is renamed to avoid colliding with the SDK's own `KromaEvents`
// event-map interface.
export {
  apiErrorText,
  brandedId,
  IndexerId,
  ItemId,
  KromaEvents as KromaEventStream,
  RequestId,
} from '@kroma/core';
export { useLocale, useT } from '@kroma/ui';
export type { AdminHostValue } from './admin/context';
export { AdminHostProvider, useAdminHost } from './admin/context';
export { Denied } from './admin/denied';
export type { AddEngineOptions, EngineChoice } from './admin/engines';
export {
  AddEngineHost,
  addEngine,
  FieldForm,
  useEnabledEngines,
  useModuleEnabled,
  useModuleEnabledCheck,
} from './admin/engines';
export { isAnyAdmin, useAsyncAction, useCap, usePoll } from './admin/hooks';
export { ModuleFailed, ModuleLoading, ModuleUnavailable } from './admin/page-states';
export { SettingsView } from './admin/settings';
export type { EventBus, EventKey } from './bus';
export { createEventBus } from './bus';
export type { KromaEvents, ModuleApiRegistry } from './contracts';
export type { DefineModuleOptions, ModuleManifestInput, ModulePage } from './define';
export { defineModule, pageHref } from './define';
export { useServerEvents } from './events';
export type { HostApi, HostAuth, HostBase, HostI18n, HostNav, KromaHost } from './host';
export { moduleIconUrl } from './icon';
export type {
  KromaModule,
  ModuleComponentProps,
  NavItem,
  RouteDef,
  SettingsPanel,
  SlotContribution,
  SlotName,
  SlotProps,
} from './module';
export type {
  ModuleNav,
  ModulePanel,
  ModuleRoute,
  ModuleSlotEntry,
  ModuleStatus,
} from './registry';
export { depEntries, ModuleRegistry } from './registry';
export { ModuleScope, moduleApiHook, useModuleApi } from './scope';
export { ModuleSlot, ModuleSlotProvider, useSlotEntries } from './slot';
export type {
  ConfigField,
  Contribution,
  Dependencies,
  FeRemote,
  ModuleManifest,
  PointReq,
} from './types';
export type { TableActionProps, TableCellProps, TableRootProps, TableRowProps } from './ui/table';
export { TABULAR, Table } from './ui/table';
