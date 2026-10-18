import type { BreakpointRuntime } from './breakpoint';
import type { ThemeRuntime } from './theme';

/** Identity for versioned style caches; canonical state lives in the root. */
export interface StyleScope {
  readonly theme?: ThemeRuntime;
  readonly breakpoints?: BreakpointRuntime;
}
export const DEFAULT_STYLE_SCOPE: StyleScope = Object.freeze({});
