// Shim: the confirm callable lives in `@kroma/admin-kit` now, shared with
// module pages. Re-exported so existing call sites keep importing from
// `#web/shared/ui`; the single `<ConfirmDialog />` root in `routes/__root.tsx`
// serves both.

export { ConfirmDialog, type ConfirmProps, confirmDialog } from '@kroma/admin-kit';
