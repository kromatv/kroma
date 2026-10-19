// A box nothing measures, presses or refers to, drawn as the <div> react-native-web
// would have drawn, without the View around it: no layout observer, no responder,
// no platform methods, no merged refs. The same reset class and the same compiled
// classes, so the element paints identically.

import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

type Resolver = (styles: unknown) => [string, Record<string, unknown> | undefined];

const resolve = StyleSheet as unknown as Resolver;

const reset = StyleSheet.create({
  view$raw: {
    alignContent: 'flex-start',
    alignItems: 'stretch',
    backgroundColor: 'transparent',
    border: '0 solid black',
    boxSizing: 'border-box',
    display: 'flex',
    flexBasis: 'auto',
    flexDirection: 'column',
    flexShrink: 0,
    listStyle: 'none',
    margin: 0,
    minHeight: 0,
    minWidth: 0,
    padding: 0,
    position: 'relative',
    textDecoration: 'none',
    zIndex: 0,
  } as ViewStyle,
} as Record<string, ViewStyle>);

const PASS = new Set(['testID', 'dataSet']);

const hyphenate = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** Whether a box with no ref can skip react-native-web's View: nothing beside
 *  its style and children but `testID` and `dataSet`. */
export function isStaticHost(rest: Readonly<Record<string, unknown>>): boolean {
  for (const key in rest) if (!PASS.has(key)) return false;
  return true;
}

interface StaticViewProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
  dataSet?: Record<string, string | number | undefined>;
}

/** The `<div>` a react-native-web View renders, for a box that needs nothing
 *  else from it. */
export function StaticView({ style, children, testID, dataSet }: Readonly<StaticViewProps>) {
  const [className, inline] = resolve([reset.view$raw, style]);
  const data: Record<string, string | number> = {};
  if (dataSet) {
    for (const [key, value] of Object.entries(dataSet)) {
      if (value !== undefined) data[`data-${hyphenate(key)}`] = value;
    }
  }
  return (
    <div className={className} style={inline} data-testid={testID} {...data}>
      {children}
    </div>
  );
}
