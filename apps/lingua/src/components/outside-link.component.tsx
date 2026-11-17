import { View, type ViewProps } from 'react-native';

/** The element a kit control's `asChild` renders to open an address outside Lingua, in a new tab. */
export function OutsideLink({ to, ...props }: Readonly<ViewProps & { to: string }>) {
  const anchor = { ...props, href: to, hrefAttrs: { target: 'blank', rel: 'noopener noreferrer' } };
  return <View {...anchor} />;
}
