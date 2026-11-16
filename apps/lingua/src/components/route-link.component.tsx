import { registered } from '@kromatv/ui/kit';
import { createLink } from '@tanstack/react-router';
import { View, type ViewProps } from 'react-native';

type RouteAnchorProps = Readonly<
  Omit<ViewProps, 'style'> & { style?: Parameters<typeof registered>[0] }
>;

/** The element a kit control's `asChild` renders as, so a route is a real `<a href>` the router navigates. */
export const RouteLink = createLink(function RouteAnchor({ style, ...props }: RouteAnchorProps) {
  return <View {...props} style={registered(style)} />;
});
