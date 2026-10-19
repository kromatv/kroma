import { type ReactNode, useContext } from 'react';
import { type StyleProp, StyleSheet, Text, type TextStyle } from 'react-native';
import { unstable_TextAncestorContext as TextAncestorContext } from 'react-native-web';

type Resolver = (styles: unknown) => [string, Record<string, unknown> | undefined];

const resolve = StyleSheet as unknown as Resolver;

const reset = StyleSheet.create({
  text$raw: {
    backgroundColor: 'transparent',
    border: '0 solid black',
    boxSizing: 'border-box',
    color: 'black',
    display: 'inline',
    font: '14px System',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    position: 'relative',
    textAlign: 'start',
    textDecoration: 'none',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  },
  oneLine: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    wordWrap: 'normal',
  },
  multiLine: {
    display: '-webkit-box',
    maxWidth: '100%',
    overflow: 'clip',
    textOverflow: 'ellipsis',
    WebkitBoxOrient: 'vertical',
  },
} as unknown as Record<string, TextStyle>);

const clamps = new Map<number, TextStyle>();

function clamp(lines: number): TextStyle {
  let style = clamps.get(lines);
  if (!style) {
    style = StyleSheet.create({ clamp: { WebkitLineClamp: lines } as TextStyle }).clamp;
    clamps.set(lines, style);
  }
  return style;
}

const PASS = new Set(['children', 'testID']);

const plain = (child: unknown): child is string | number =>
  typeof child === 'string' || typeof child === 'number';

type StaticRest = { children?: string | number | Array<string | number>; testID?: string };

/** Whether a string can skip react-native-web's Text: nothing beside its
 *  children and `testID`, and children that are only strings and numbers. */
export function isStaticText(rest: Readonly<Record<string, unknown>>): rest is StaticRest {
  for (const key in rest) if (!PASS.has(key)) return false;
  const { children, testID } = rest;
  if (testID !== undefined && typeof testID !== 'string') return false;
  return children == null || plain(children) || (Array.isArray(children) && children.every(plain));
}

interface StaticTextProps {
  style?: StyleProp<TextStyle>;
  lines?: number;
  children?: ReactNode;
  testID?: string;
}

/** The `<div>` a react-native-web Text renders, for a string that needs nothing
 *  else from it. Inside another Text it is that Text's span, as before. */
export function StaticText({ style, lines, children, testID }: Readonly<StaticTextProps>) {
  if (useContext(TextAncestorContext)) {
    return (
      <Text numberOfLines={lines} style={style} testID={testID}>
        {children}
      </Text>
    );
  }
  const many = lines != null && lines > 1;
  const [className, inline] = resolve([
    many && clamp(lines),
    reset.text$raw,
    lines === 1 && reset.oneLine,
    many && reset.multiLine,
    style,
  ]);
  return (
    <div dir="auto" className={className} style={inline} data-testid={testID}>
      {children}
    </div>
  );
}
