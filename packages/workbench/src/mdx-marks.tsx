// The inline half of the element map: everything that lives INSIDE a line of
// prose, and the rule that decides what a line is.
//
// React Native's <Text> inherits from its parent, but the kit's <Text> defaults
// both `variant` and `color` rather than leaving them unset, so a nested mark has
// to be TOLD what it sits in. That is what `Prose` publishes and `Mark` reads.

import { Box, CheckboxFace, Img, styles, Text, type TextProps } from '@kroma/ui/kit';
import { space } from '@kroma/ui/tokens';
import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import { openWebLink } from './link';

interface Ink {
  variant: TextProps['variant'];
  color: TextProps['color'];
}

/** The role and colour a document's running text is set in. Every block that is
 * not a heading opens in this ink. */
const BODY: Ink = { variant: 'body', color: 'textMuted' };

const InkContext = createContext<Ink>(BODY);

interface ProseProps extends Ink {
  style?: TextProps['style'];
  children?: ReactNode;
}

/** A run of prose, publishing its own ink to the marks inside it. */
function Prose({ variant, color, style, children }: Readonly<ProseProps>) {
  const ink = useMemo(() => ({ variant, color }), [variant, color]);
  return (
    <InkContext.Provider value={ink}>
      <Text variant={variant} color={color} style={style}>
        {children}
      </Text>
    </InkContext.Provider>
  );
}

interface MarkProps {
  style?: TextProps['style'];
  color?: TextProps['color'];
  onPress?: () => void;
  children?: ReactNode;
}

/** One inline mark, in the ink of the block it sits in. */
function Mark({ style, color, onPress, children }: Readonly<MarkProps>) {
  const ink = useContext(InkContext);
  return (
    <Text variant={ink.variant} color={color ?? ink.color} style={style} onPress={onPress}>
      {children}
    </Text>
  );
}

function Strong({ children }: Readonly<{ children?: ReactNode }>) {
  return <Mark style={s.bold}>{children}</Mark>;
}

function Emphasis({ children }: Readonly<{ children?: ReactNode }>) {
  return <Mark style={s.em}>{children}</Mark>;
}

function Strike({ children }: Readonly<{ children?: ReactNode }>) {
  return <Mark style={s.del}>{children}</Mark>;
}

function Superscript({ children }: Readonly<{ children?: ReactNode }>) {
  return <Mark style={s.sup}>{children}</Mark>;
}

function InlineCode({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Mark style={s.code} color="accent">
      {children}
    </Mark>
  );
}

function Anchor({ href, children }: Readonly<{ href?: string; children?: ReactNode }>) {
  return (
    <Mark style={s.link} color="accent" onPress={href ? () => openWebLink(href) : undefined}>
      {children}
    </Mark>
  );
}

function LineBreak() {
  return <Mark>{'\n'}</Mark>;
}

// A GFM task box: the kit's checkbox FACE, which is the drawing without the
// control. A rendering of a document is not a form, so the box has to look like
// a checkbox and have nothing about it anyone can tick.
function TaskBox({ checked }: Readonly<{ checked?: boolean }>) {
  return (
    <Box style={s.task}>
      <CheckboxFace checked={Boolean(checked)} />
    </Box>
  );
}

function Picture({ src, alt }: Readonly<{ src?: string; alt?: string }>) {
  return (
    <Box style={s.image}>
      <Img src={src ?? null} alt={alt} fit="contain" radius="sm" />
    </Box>
  );
}

const INLINE = new Set<unknown>([
  Anchor,
  Emphasis,
  InlineCode,
  LineBreak,
  Picture,
  Strike,
  Strong,
  Superscript,
  TaskBox,
]);

/** Consecutive inline children gathered into one <Text>, block children left
 * alone. This is what lets a list item hold a bare sentence (a tight list), a
 * paragraph (a loose one) or a code block, all on a platform where a stray
 * string inside a view is a crash rather than a stray string. */
function runs(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let run: ReactNode[] = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push(
      <Prose key={`run-${out.length}`} variant={BODY.variant} color={BODY.color}>
        {run}
      </Prose>,
    );
    run = [];
  };
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string' || (isValidElement(child) && INLINE.has(child.type))) {
      run.push(child);
    } else {
      flush();
      out.push(child);
    }
  }
  flush();
  return out;
}

// The mono stack is a system one and has no role on the ramp, so its size is
// written here: a shade under the running text, which is where a monospaced face
// stops looking a size larger than the prose around it.
const CODE_SIZE = 14;

const TASK_DROP = 5;

const s = styles({
  bold: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through' },
  sup: { fontSize: 10 },
  link: { textDecorationLine: 'underline' },
  code: { font: 'mono', fontSize: CODE_SIZE, bg: 'white/6' },
  image: { h: 140 },
  // A box on a text line sits on the baseline, which puts it a couple of points
  // high against the letters beside it; the drop lands it on their optical
  // centre, on the first line of a wrapped item as much as on a short one.
  task: { mr: space[2], mb: -TASK_DROP },
});

export {
  Anchor,
  BODY,
  Emphasis,
  InlineCode,
  LineBreak,
  Picture,
  Prose,
  runs,
  Strike,
  Strong,
  Superscript,
  TaskBox,
};
