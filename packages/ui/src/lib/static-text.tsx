import type { ReactNode } from 'react';
import { type StyleProp, Text, type TextStyle } from 'react-native';

type StaticRest = { children?: string | number | Array<string | number>; testID?: string };

/** React Native has no cheaper host than its Text, so every string is one. */
export function isStaticText(_rest: Readonly<Record<string, unknown>>): _rest is StaticRest {
  return false;
}

interface StaticTextProps {
  style?: StyleProp<TextStyle>;
  lines?: number;
  children?: ReactNode;
  testID?: string;
}

/** The Text a string renders as. */
export function StaticText({ style, lines, children, testID }: Readonly<StaticTextProps>) {
  return (
    <Text numberOfLines={lines} style={style} testID={testID}>
      {children}
    </Text>
  );
}
