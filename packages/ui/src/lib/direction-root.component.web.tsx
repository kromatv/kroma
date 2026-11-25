import { directionOf } from '@kromatv/i18n';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocaleContext } from 'react-native-web';
import { DirectionContext } from './direction';

interface DirectionRootProps {
  locale: string;
  children: ReactNode;
}

const HOST = StyleSheet.create({
  host: { display: 'contents', width: '100%', height: '100%' },
}).host;

/** Lays the tree out the way `locale` is written. react-native-web reads the
 *  direction off the nearest `dir`, so a tree that turns the other way from the
 *  one around it is held in a box that wears one and draws nothing. */
export function DirectionRoot({ locale, children }: Readonly<DirectionRootProps>) {
  const dir = directionOf(locale);
  const turns = useLocaleContext().direction !== dir;
  return (
    <DirectionContext value={dir}>
      {turns ? (
        <View dir={dir} style={HOST}>
          {children}
        </View>
      ) : (
        children
      )}
    </DirectionContext>
  );
}
