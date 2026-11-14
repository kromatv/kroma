import type { ButtonBrand } from '@kromatv/client/accounts';
import { sharedStyle, useStyleScope } from '@kromatv/ui/kit';
import { useGround } from '#web/shared/lib/use-ground';

/** The look a provider's owner asks for its button on the ground this page is
 * on, with the styles that paint it: `surface` for the button, whose edge is
 * always there so a button with none is as tall as one with, and `ink` for its
 * label. `null` for a provider that asks for nothing. */
export function useButtonLook(brand: ButtonBrand | null | undefined) {
  const scope = useStyleScope();
  const ground = useGround();
  if (!brand) return null;
  const look = brand[ground];
  const edge = look.stroke ?? look.fill;
  return {
    look,
    surface: sharedStyle(
      `provider:surface:${look.fill}:${edge}`,
      { backgroundColor: look.fill, borderWidth: 1, borderColor: edge },
      scope,
    ),
    ink: sharedStyle(`provider:ink:${look.ink}`, { color: look.ink }, scope),
  };
}
