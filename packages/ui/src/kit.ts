/// <reference path="lib/types/react-native-tv.d.ts" />
/// <reference path="lib/types/react-native-web.d.ts" />
// @kroma/ui/kit: the universal component library.
//
// One source of components that renders natively on Apple TV / Android TV
// (React Native) and in the browser on Tizen / webOS / desktop (react-native-web).
// Nothing in here imports react-dom or reaches for the DOM outside a `.web.tsx`
// file, which is the ONLY place the two worlds differ; the bundlers pick per
// target (Metro takes the plain file, Vite the `.web` one).
//
// THE SPLIT WITH THE PACKAGE ROOT. `@kroma/ui/kit` is the component library;
// `@kroma/ui` is the SERVICES - the hooks and providers that talk to the server
// or hold app state (i18n, auth, playback, storyboard, theme audio, AI suggest)
// - plus `Player`, which is a component but ships from the root because it is
// the one organism whose props are the service layer's own types.
//
// The two are disjoint, and that is enforced by omission rather than by a test:
// `Player` lives at components/organisms/player/ but is deliberately LEFT OUT of
// components/organisms/index.ts. Adding it there - the obvious thing to do -
// would make both entry points export the same symbols. Move the whole player
// over instead if that day comes.

// ---- components, by atomic level ----
//
// ATOMS are the indivisible controls (Button, Txt, Icon): break one down and it
// stops being useful. MOLECULES bond a few atoms into one arrangement the design
// names (a poster card, a labelled field). ORGANISMS are whole regions that own
// behaviour (a rail that windows its children, a dialog that takes the remote).
// TEMPLATES are page skeletons carrying no data - today, the 1920x1080 stage.
//
// The level above, PAGES, is not here and never will be: a page is a template
// filled with real data, which means it knows the server, the router and the
// session. Those live in the app packages. See src/ui/README.md.
//
// All four are re-exported FLAT, so a consumer writes
// `import { Button, ListRow, Rail } from '@kroma/ui/kit'` and never has to know
// which level something sits at. The levels are for the people editing the kit.
// A consumer who wants one component without the rest of the graph can reach for
// the per-component subpath instead: `@kroma/ui/kit/atoms/button`.
export * from './components/atoms';
export * from './components/molecules';
export * from './components/organisms';
export * from './components/templates';
export type { Align, BoxStyleProps, Justify, Spacing } from './lib/box-style';
export { boxStyle, color } from './lib/box-style';
export type { Rect } from './lib/cover-rect';
export { coverRect, parsePosition } from './lib/cover-rect';
// ---- cross-platform CSS escape hatches ----
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
// A full-screen overlay takes the remote with this (the brand intro does).
export { clearInputHolds, holdInput, inputHeld } from './lib/input-gate';
export { PageMain } from './lib/landmark';
// ---- hooks ----
export type { LoopKind } from './lib/loop';
export { useLoop } from './lib/loop';
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
// ---- design tokens ----
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
// The workbench is not here at all: it is a tool, not part of the library, and it
// pulls in every story, so an app that never opens it should never bundle it. It
// lives in @kroma/workbench, which each host configures for itself; a shell that
// offers one imports its own config lazily.
