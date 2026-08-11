// Story documentation, rendered by the kit itself.
//
// Docs prose supports exactly two inline marks: **bold** and `code`. A real
// markdown pipeline (MDX, remark) is a DOM-shaped dependency the native
// workbench cannot carry, and component docs never needed more than emphasis
// and identifiers anyway. Everything here renders through <Text>, so it works
// on every target the kit does, television included.

import { Box, Icon, styles, Text, type TextProps } from '@kroma/ui/kit';
import { MONO } from './code';
import type { Story } from './story';

type Mark = 'plain' | 'bold' | 'code';

// One pass over the prose, splitting out the marked spans in order. Anything unclosed stays
// literal, so a stray backtick cannot eat the paragraph.
function segments(text: string): { text: string; mark: Mark }[] {
  const out: { text: string; mark: Mark }[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      out.push({ text: part.slice(2, -2), mark: 'bold' });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      out.push({ text: part.slice(1, -1), mark: 'code' });
    } else {
      out.push({ text: part, mark: 'plain' });
    }
  }
  return out;
}

const s = styles({
  bold: { fontWeight: '700' },
  code: { fontFamily: MONO, fontSize: 13, color: 'accent', bg: 'white/6' },
});

interface RichTextProps extends TextProps {
  children: string;
}

// <Text> that understands the two inline marks. Nested <Text> is React Native's own rich-text
// mechanism, so this composes instead of parsing.
function RichText({ children, ...txt }: Readonly<RichTextProps>) {
  return (
    <Text {...txt}>
      {segments(children).map((segment, at) =>
        segment.mark === 'plain' ? (
          segment.text
        ) : (
          <Text
            // Order never changes for a given string: the index IS the identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
            key={at}
            variant={txt.variant}
            color={txt.color}
            style={segment.mark === 'bold' ? s.bold : s.code}
          >
            {segment.text}
          </Text>
        ),
      )}
    </Text>
  );
}

// One imperative line of guidance, ticked or crossed.
function GuidelineRow({ text, good }: Readonly<{ text: string; good: boolean }>) {
  return (
    <Box row gap={10} align="flex-start">
      <Box mt={2} shrink={0}>
        <Icon name={good ? 'check' : 'x'} size={14} color={good ? 'success' : 'danger'} />
      </Box>
      <Box flex>
        <RichText variant="meta" color="textMuted">
          {text}
        </RichText>
      </Box>
    </Box>
  );
}

function Guidelines({
  rules,
}: Readonly<{ rules: { do: readonly string[]; dont: readonly string[] } }>) {
  if (rules.do.length === 0 && rules.dont.length === 0) return null;
  return (
    <Box gap={10}>
      {rules.do.map((rule) => (
        <GuidelineRow key={rule} text={rule} good />
      ))}
      {rules.dont.map((rule) => (
        <GuidelineRow key={rule} text={rule} good={false} />
      ))}
    </Box>
  );
}

// The call site the current controls describe, as code. Booleans render as bare props when on
// and disappear when off, strings quote, numbers brace: the way the line would actually be
// written. Long calls break one prop per line, the way the formatter would break them.
function snippet(story: Story, args: Record<string, unknown>): string {
  const name = story.name.replace(/[^A-Za-z0-9]/g, '');
  const props: string[] = [];
  for (const control of story.controls) {
    const value = args[control.key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') {
      if (value) props.push(control.key);
    } else if (typeof value === 'number') {
      props.push(`${control.key}={${value}}`);
    } else {
      // `&quot;`, not `\"`. A JSX attribute is not a JavaScript string literal:
      // it does not process backslash escapes, so `label="Say \"hi\""` ends the
      // attribute at the second quote and the paste is a syntax error. The whole
      // promise of this drawer is a call site you can paste.
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      props.push(`${control.key}="${text.replaceAll('"', '&quot;')}"`);
    }
  }
  const flat = props.length > 0 ? `<${name} ${props.join(' ')} />` : `<${name} />`;
  if (flat.length <= 72) return flat;
  return `<${name}\n  ${props.join('\n  ')}\n/>`;
}

export type { RichTextProps };
export { Guidelines, RichText, segments, snippet };
