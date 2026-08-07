// The admin UI contract: everything a module's ui/ package needs to render a full
// admin page without reaching into app internals.

export { ConfirmDialog, type ConfirmProps, confirmDialog } from './confirm';
export { AdminKitProvider, type AdminKitValue, resolveImageUrl, useAdminKit } from './context';
export {
  Button,
  Disclosure,
  IconButton,
  type IconButtonProps,
  NumberField,
  SegmentedControl,
} from './controls';
export { Drawer } from './drawer';
export { AddEngineModal, FieldForm, useEnabledEngines, useModuleEnabled } from './engines';
export { CardSkeleton, Skeleton, TableSkeleton } from './feedback';
export {
  FIELD,
  FIELD_BOX,
  FIELD_BOX_LG,
  FIELD_GROUP,
  FIELD_LG,
  FIELD_MONO,
  FIELD_TYPE,
  FIELD_TYPE_LG,
} from './field';
export {
  avatarGradient,
  decimal,
  formatBytes,
  hue,
  initial,
} from './format';
export {
  Field,
  Modal,
  ModalActions,
  OptionSelect,
  type OptionSelectProps,
  Select,
  type SelectOption,
  TextArea,
  TextInput,
} from './forms';
export { HeaderAction, PAGE_SUBTITLE, PAGE_TITLE, PageHeader } from './header';
export { Denied, isAnyAdmin, useAsyncAction, useCap, usePoll } from './hooks';
export type { ImageProps } from './image';
export { Image } from './image';
export {
  Avatar,
  C,
  Card,
  FilterLabel,
  Pill,
  ProgressBar,
  Section,
  StatCard,
  Toggle,
} from './primitives';
export { SettingsView } from './settings';
