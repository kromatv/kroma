import { createTheme, KROMA, setTheme, type Theme } from '../../src/core/theme.ts';
import { colors } from '../../src/core/tokens/colors.ts';
import { customProperties } from '../../src/core/tokens/css-palette.ts';
import { cssVar } from '../../src/core/tokens/css-var.ts';
import { shadow } from '../../src/core/tokens/effects.ts';

/**
 * The theme a browser resolves declarations under: every colour and shadow a
 * custom property, exactly what `css-palette.ts` hands the runtime there. The
 * store this process runs the engine against has no browser to read that off,
 * so the build states it.
 */
export function webTheme(): Theme {
  return createTheme(
    {
      colors: customProperties(colors, cssVar),
      shadow: customProperties(shadow, (k) => `--shadow-${k}`),
    },
    KROMA,
  );
}

/** Points the engine's store at {@link webTheme}, once per build process. */
export function resolveAsBrowser(): void {
  setTheme(webTheme());
}
