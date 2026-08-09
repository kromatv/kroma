// Shim: the generic settings renderer lives in `@kroma/module-sdk` as
// `SettingsView` (shared by the built-in settings pages and the VPN / Acquisition
// module pages). Re-exported as `SettingsPage` so call sites keep importing
// from `#web/features/admin/settings`.
export { SettingsView as SettingsPage } from '@kroma/module-sdk';
