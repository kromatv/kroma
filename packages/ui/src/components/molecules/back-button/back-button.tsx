// <BackButton>: the way back, drawn once.
//
// Five of these existed before it - the phone header's bare chevron, the detail
// hero's dark disc (on the web AND the phone), the 10-foot corner button, the
// player's top-bar pill - each re-deriving the same disc by hand. This is the
// one they share: an <IconButton> holding the chevron, scrimmed by default so
// it can float over artwork without brightening it, filling amber on focus so
// a remote can read where it is from the couch (a corner control gets no
// neighbour to compare against, so its focus state has to carry alone).
//
// The label is the accessibility name. The default is deliberately plain
// English; an app with an <I18nProvider> passes `label={t('common.back')}`.

import { IconButton, type IconButtonProps } from '#ui/components/atoms/icon-button';

interface BackButtonProps extends Omit<IconButtonProps, 'icon' | 'children'> {}

function BackButton({
  size = 44,
  glyph,
  variant = 'scrim',
  focusFill = true,
  ring = false,
  focusScale = 1.08,
  hitSlop = 8,
  label = 'Back',
  ...rest
}: Readonly<BackButtonProps>) {
  return (
    <IconButton
      {...rest}
      icon="chevron-left"
      size={size}
      // The chevron reads half a size small at the disc's default 40%: it is an
      // open stroke, not a filled glyph, so it gets exactly half the diameter.
      glyph={glyph ?? Math.round(size / 2)}
      variant={variant}
      focusFill={focusFill}
      ring={ring}
      focusScale={focusScale}
      hitSlop={hitSlop}
      label={label}
    />
  );
}

export type { BackButtonProps };
export { BackButton };
