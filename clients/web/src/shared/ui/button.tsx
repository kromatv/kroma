// The action primitive is the design system's own (@kroma/ui/kit) - one Button,
// not a browser copy and a 10-foot copy. Its `Focusable` degrades to a plain
// pressable when no navigator is mounted, so it is a mouse button here.
// Re-exported so pages keep importing it from `#web/shared/ui`.
export type { ButtonProps, ButtonSize, ButtonVariant } from '@kroma/ui/kit';
export { Button } from '@kroma/ui/kit';
