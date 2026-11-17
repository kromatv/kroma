import { CONTROL, type StyleDecl, svFor } from '@kromatv/ui/kit';
import { Focusable } from '@kromatv/ui/kit/atoms/focusable';
import { Icon, type IconName } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { RouteLink } from '#site/components/route-link.component';

const SHELL = CONTROL.sm;

const navItem = svFor<{ root: StyleDecl; label: StyleDecl; glyph: { color: string } }>()({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 8,
      minH: 40,
      px: SHELL.px,
      radius: SHELL.radius,
      _hover: { bg: 'tint/5' },
    },
    label: { color: 'textMuted', _hover: { color: 'text' } },
    glyph: { color: 'textMuted', _hover: { color: 'text' } },
  },
  variants: {
    current: {
      true: {
        root: { bg: 'accentSoft', _hover: { bg: 'accentSoftHover' } },
        label: { color: 'accentText', _hover: { color: 'accentText' } },
        glyph: { color: 'accentText', _hover: { color: 'accentText' } },
      },
    },
  },
  defaults: { current: false },
});

/** Where a header link leads. */
export type NavTarget = '/' | '/contributions' | '/setup';

/** One section in Lingua's header: a real link, marked as the current page while it is. `icon` is left out on a phone. */
export function NavItem({
  to,
  icon,
  label,
  current,
}: Readonly<{ to: NavTarget; icon?: IconName; label: string; current: boolean }>) {
  return (
    <Focusable sv={navItem} vars={{ current }} current={current ? 'page' : undefined} asChild>
      {({ slots }) => (
        <RouteLink to={to}>
          {icon ? <Icon name={icon} size={17} color={slots.glyph.color} /> : null}
          <Text variant="label" lines={1} style={slots.label}>
            {label}
          </Text>
        </RouteLink>
      )}
    </Focusable>
  );
}
