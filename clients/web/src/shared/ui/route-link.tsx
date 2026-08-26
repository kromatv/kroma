import { createLink, type LinkProps } from '@tanstack/react-router';
import { View, type ViewProps } from 'react-native';

/**
 * The element `<Focusable as>` renders in place of its pressable, so a route
 * becomes a real `<a href>`.
 *
 * Everything the router computes rides through to react-native-web, which is
 * what turns `href` into an anchor.
 */
const RouteLink = createLink(function RouteAnchor(props: Readonly<ViewProps>) {
  return <View {...props} />;
});

/** A path this app's router knows, for a nav table that names its destinations
 *  as strings. A module's page path is not one, so `SideNav.Item` still takes a
 *  plain string: that path arrives at runtime from the module's manifest. */
type RoutePath = NonNullable<LinkProps['to']>;

export type { RoutePath };
export { RouteLink };
