import { KROMA, KROMA_LIGHT, type Theme } from '#ui/core/theme-create';
import { CSS_COLORS } from '#ui/core/tokens/css-palette';
import { withAlpha } from '#ui/core/tokens/colors';

export function onPaper(theme: Theme = KROMA): boolean {
  return !CSS_COLORS && theme.colors.bg === KROMA_LIGHT.colors.bg;
}
export function groundShade(alpha: number, theme: Theme = KROMA): string {
  return withAlpha(theme.colors.bg, alpha);
}
