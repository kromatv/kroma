/// <reference path="lib/types/react-native-tv.d.ts" />
/// <reference path="lib/types/react-native-web.d.ts" />
// @kroma/ui/kit: the universal component library. Services and `Player` ship
// from `@kroma/ui` instead, so the two entry points share no symbols.
export * from './components/atoms';
export * from './components/molecules';
export * from './components/organisms';
export * from './components/templates';
export type { Align, BoxStyleProps, Justify, Spacing } from './lib/box-style';
export { boxStyle, color } from './lib/box-style';
export type { Rect } from './lib/cover-rect';
export { coverRect, parsePosition } from './lib/cover-rect';
export { backdropBlur, bgPosition, bgSize, gradient, promote } from './lib/css';
// The one sanctioned way to ask for the DOM from shared code (null on a TV).
export { webDocument, webWindow } from './lib/dom';
export { useFocusNav } from './lib/focus-nav';
export { configureRemote, useHardwareKeys } from './lib/focus-remote';
export type { FocusScopeProps, ScreenScopeProps } from './lib/focus-scope';
export { FocusColumn, FocusRegion, FocusScope } from './lib/focus-scope';
export type { FocusScrollProps } from './lib/focus-scroll';
export { FocusLine, FocusRail, FocusScroll, FocusSlot } from './lib/focus-scroll';
export type { FocusNavHandlers } from './lib/focus-types';
export {
  DEFAULT_ICON_SIZE,
  DEFAULT_ICON_STROKE,
  hasGlyph,
  iconNames,
} from './lib/glyph';
export type { ImageBackend, ImageBackendProps } from './lib/image-backend';
export { imageBackend, reactNativeImage, setImageBackend } from './lib/image-backend';
export { clearInputHolds, holdInput, inputHeld } from './lib/input-gate';
export { PageMain } from './lib/landmark';
export type { LoopKind } from './lib/loop';
export { useLoop } from './lib/loop';
export { OverlayHost } from './lib/overlay-host';
export type { PerfReport } from './lib/perf';
export { perfReport, perfRunning, resetPerf, startPerf, stopPerf } from './lib/perf';
export {
  armPressGuard,
  clearPressGuard,
  PRESS_GUARD_MS,
  pressGuardActive,
} from './lib/press-guard';
export type { ReportCategoryMeta } from './lib/report-categories';
export { REPORT_CATEGORIES } from './lib/report-categories';
export type { RingGeometry, RingProps } from './lib/ring';
export { RING_ROTATION, ringGeometry } from './lib/ring';
export type {
  CompoundVariant,
  SlotStyles,
  Slots,
  SlotVariantGroups,
  SvConfig,
  SvFn,
  SvSlotsConfig,
  SvSlotsFn,
  VariantProps,
  VariantSource,
} from './lib/sv';
export { sv } from './lib/sv';
export { SvgXml } from './lib/svg';
export * from './lib/tokens';
export type { GrowingCount } from './lib/use-growing-count';
export { useGrowingCount } from './lib/use-growing-count';
export type { WheelSpin } from './lib/wheel-paths';
export {
  KROMA_WHEEL_COLORS,
  KROMA_WHEEL_SEGMENTS,
  WHEEL_SPIN_MS,
  WHEEL_VIEWBOX,
} from './lib/wheel-paths';
