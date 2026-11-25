import { Button } from '#ui/components/atoms/button';
import { IconButton, type IconButtonProps } from '#ui/components/atoms/icon-button';

interface BackButtonProps extends Omit<IconButtonProps, 'icon'> {
  /** Where it goes, spelled out beside the chevron: "Modules", not "Back". A
   *  header uses it so the destination is readable; a control floating over
   *  artwork leaves it off and stays a disc. */
  text?: string;
}

/** The shared way back: a chevron <IconButton>, scrimmed to float over artwork.
 *  `label` is the accessible name and defaults to plain English. With `text` it is a
 *  <Button> in the same variant, since an icon disc cannot hold words. */
function BackButton({
  diameter = 44,
  glyph,
  variant = 'scrim',
  focusFill = true,
  focusScale = 1.08,
  hitSlop = 8,
  label = 'Back',
  text,
  ...rest
}: Readonly<BackButtonProps>) {
  if (text !== undefined) {
    return (
      <Button
        {...rest}
        icon="chevron-left"
        label={text}
        variant={variant === 'primary' || variant === 'danger' ? variant : 'ghost'}
        size="sm"
        hitSlop={hitSlop}
      />
    );
  }
  return (
    <IconButton
      {...rest}
      icon="chevron-left"
      diameter={diameter}
      // An open stroke reads small at the disc's default 40%, so the chevron
      // gets exactly half the diameter.
      glyph={glyph ?? Math.round(diameter / 2)}
      variant={variant}
      focusFill={focusFill}
      focusScale={focusScale}
      hitSlop={hitSlop}
      label={label}
    />
  );
}

export type { BackButtonProps };
export { BackButton };
