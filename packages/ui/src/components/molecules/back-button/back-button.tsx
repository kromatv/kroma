// The shared way back: a chevron <IconButton>, scrimmed so it can float over
// artwork. `label` is the accessibility name and defaults to plain English; an
// app with an <I18nProvider> passes `label={t('common.back')}`.

import { IconButton, type IconButtonProps } from '#ui/components/atoms/icon-button';

interface BackButtonProps extends Omit<IconButtonProps, 'icon' | 'children'> {}

function BackButton({
  diameter = 44,
  glyph,
  variant = 'scrim',
  focusFill = true,
  focusScale = 1.08,
  hitSlop = 8,
  label = 'Back',
  ...rest
}: Readonly<BackButtonProps>) {
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
