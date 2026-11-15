import { View, type ViewProps } from 'react-native';

/** The element a control's `asChild` renders to open an address outside this
 * app, in a new tab. It is a view, so everything the control hands over rides
 * through to react-native-web, which turns `href` into a real anchor. */
export function OutsideLink({ to, ...props }: Readonly<ViewProps & { to: string }>) {
  const anchor = {
    ...props,
    href: to,
    hrefAttrs: { target: 'blank', rel: 'noopener noreferrer' },
  };
  return <View {...anchor} />;
}
