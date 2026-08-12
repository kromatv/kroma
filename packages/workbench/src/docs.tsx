// Story documentation, rendered by the kit itself.
//
// Two spellings, one look: a sibling `<story>.docs.mdx` compiled by the bundler
// (see `mdx.tsx` for the element map), or the inline `docs:` string a one-line
// description does not need a file for. The string is parsed by `markdown.ts`
// and drawn through THE SAME components, so neither spelling has a rendering of
// its own to drift.

import { Box, Icon, type TextProps } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { blocks, segments } from './markdown';
import { MDX_COMPONENTS, MdxDoc } from './mdx';
import { Prose } from './mdx-marks';
import type { Story, StoryDocs } from './story';

const {
  a: A,
  code: Code,
  h1: H1,
  h2: H2,
  li: Li,
  p: P,
  pre: Pre,
  strong: Strong,
  ul: Ul,
} = MDX_COMPONENTS;

// The inline marks, as the elements MDX would have emitted for them.
function marks(text: string): ReactNode[] {
  return segments(text).map((segment, at) => {
    // Order never changes for a given string: the index IS the identity.
    const key = `${at}-${segment.mark}`;
    if (segment.mark === 'bold') return <Strong key={key}>{segment.text}</Strong>;
    if (segment.mark === 'code') return <Code key={key}>{segment.text}</Code>;
    if (segment.mark === 'link') {
      return (
        <A key={key} href={segment.href}>
          {segment.text}
        </A>
      );
    }
    return segment.text;
  });
}

interface RichTextProps {
  children: string;
  variant?: TextProps['variant'];
  color?: TextProps['color'];
}

/** One line of prose with its inline marks: a demo's description, a prop's
 * documentation. Nested <Text> is React Native's own rich-text mechanism, so
 * this composes instead of parsing. */
function RichText({ children, variant = 'meta', color = 'textMuted' }: Readonly<RichTextProps>) {
  return (
    <Prose variant={variant} color={color}>
      {marks(children)}
    </Prose>
  );
}

/** A block of markdown written as a string. A one-line description parses as a
 * single paragraph, which is what keeps the inline `docs:` spelling working. */
function Markdown({ children }: Readonly<{ children: string }>) {
  return (
    <Box>
      {blocks(children).map((block, at) => {
        // The document order is fixed for a given string: the index IS the identity.
        const key = `${at}-${block.kind}`;
        if (block.kind === 'code') {
          return (
            <Pre key={key}>
              <Code>{block.code}</Code>
            </Pre>
          );
        }
        if (block.kind === 'heading') {
          const Heading = block.level === 1 ? H1 : H2;
          return <Heading key={key}>{marks(block.text)}</Heading>;
        }
        if (block.kind === 'list') {
          return (
            <Ul key={key}>
              {block.items.map((item) => (
                <Li key={item}>{marks(item)}</Li>
              ))}
            </Ul>
          );
        }
        return <P key={key}>{marks(block.text)}</P>;
      })}
    </Box>
  );
}

/** A story's prose, however it was written. */
function StoryProse({ docs }: Readonly<{ docs: StoryDocs }>) {
  return typeof docs === 'string' ? <Markdown>{docs}</Markdown> : <MdxDoc content={docs} />;
}

// One imperative line of guidance, ticked or crossed.
function GuidelineRow({ text, good }: Readonly<{ text: string; good: boolean }>) {
  return (
    <Box row gap={10} align="flex-start">
      <Box mt={2} shrink={0}>
        <Icon name={good ? 'check' : 'x'} size={14} color={good ? 'success' : 'danger'} />
      </Box>
      <Box flex>
        <RichText>{text}</RichText>
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

export { Guidelines, Markdown, RichText, StoryProse, snippet };
