import { describe, expect, it } from 'vitest';
import { fullyInlined, inlineArgs } from './story-code-inline';

describe('inlineArgs', () => {
  it('drops the arrow a story format requires and writes its args in', () => {
    const code = `({ icon, label }) => (
  <ListRow.Root icon={icon}>
    <ListRow.Label>{label}</ListRow.Label>
  </ListRow.Root>
)`;
    expect(inlineArgs(code, { icon: 'settings', label: 'Language' })).toBe(
      `<ListRow.Root icon="settings">
  <ListRow.Label>Language</ListRow.Label>
</ListRow.Root>`,
    );
  });

  it('takes the branch the canvas took, and leaves no gap where the other was', () => {
    const code = `({ hint }) => (
  <Row>
    {hint ? <Hint>{hint}</Hint> : null}
  </Row>
)`;
    expect(inlineArgs(code, { hint: '' })).toBe(`<Row>
</Row>`);
    expect(inlineArgs(code, { hint: '128 titles' })).toBe(`<Row>
  <Hint>128 titles</Hint>
</Row>`);
  });

  it('keeps the braces on anything that is not a string', () => {
    const code = '({ count, open }) => <Badge count={count} open={open} />';
    expect(inlineArgs(code, { count: 4, open: true })).toBe('<Badge count={4} open={true} />');
  });

  it('reads a single parameter as well as a destructured one', () => {
    expect(inlineArgs('args => <Chip label={args} />', { args: 'HDR' })).toBe(
      '<Chip label="HDR" />',
    );
  });

  it('leaves an expression it cannot account for exactly as written', () => {
    const code = '({ items }) => <List rows={items.map(one)} count={items.length} />';
    expect(inlineArgs(code, { items: [1, 2] })).toBe(
      '<List rows={items.map(one)} count={items.length} />',
    );
  });

  it('leaves a value it cannot write back as a literal alone', () => {
    const code = '({ node }) => <Slot>{node}</Slot>';
    expect(inlineArgs(code, { node: { kind: 'element' } })).toBe('<Slot>{node}</Slot>');
  });

  it('returns a block-bodied arrow whole, because it is statements before it is JSX', () => {
    const code = `({ n }) => {
  const doubled = n * 2;
  return <Text>{doubled}</Text>;
}`;
    expect(inlineArgs(code, { n: 2 })).toBe(code);
  });

  it('leaves source that is already JSX alone', () => {
    expect(inlineArgs('<Chip label="HDR" />', {})).toBe('<Chip label="HDR" />');
  });

  it('is nothing when there is nothing to show', () => {
    expect(inlineArgs(undefined, {})).toBeNull();
  });

  it('does not mistake a brace inside a string for a hole', () => {
    const code = `({ label }) => <Text hint="{not a hole}">{label}</Text>`;
    expect(inlineArgs(code, { label: 'Audio' })).toBe('<Text hint="{not a hole}">Audio</Text>');
  });

  it('leaves an unterminated arrow alone rather than guessing', () => {
    expect(inlineArgs('({ a } => <X />', { a: 1 })).toBe('({ a } => <X />');
  });
  it('keeps a blank line the author wrote', () => {
    const code = `({ label }) => (
  <Group>
    <Chip label={label} />

    <Chip label="Other" />
  </Group>
)`;
    expect(inlineArgs(code, { label: 'HDR' })).toBe(`<Group>
  <Chip label="HDR" />

  <Chip label="Other" />
</Group>`);
  });
  it('writes the whole bag out where a render spreads it', () => {
    const code = '(props) => <EmptyState.Root {...props} />';
    expect(inlineArgs(code, { title: 'No results', compact: true, note: '' })).toBe(
      '<EmptyState.Root title="No results" compact />',
    );
  });
});

describe('fullyInlined', () => {
  it('is the inlined markup when every parameter was written back', () => {
    const code = '({ label }) => <Chip label={label} />';
    expect(fullyInlined(code, { label: 'HDR' })).toBe('<Chip label="HDR" />');
  });

  it('is nothing when a rest spread stands for props the source never names', () => {
    const code = '({ icon, ...props }) => <Chip {...props} icon={icon} />';
    expect(fullyInlined(code, { icon: 'star', tone: 'danger' })).toBeNull();
    expect(inlineArgs(code, { icon: 'star', tone: 'danger' })).toContain('{...props}');
  });

  it('is nothing for a block body, which is statements before it is markup', () => {
    expect(fullyInlined('({ n }) => { return <X n={n} />; }', { n: 1 })).toBeNull();
  });

  it('is nothing for markup that took no args, which cannot follow a control', () => {
    expect(fullyInlined('<Chip label="HDR" />', {})).toBeNull();
  });

  it('is nothing when there is no code at all', () => {
    expect(fullyInlined(undefined, {})).toBeNull();
  });
  it('reads a parameter that carries its type', () => {
    const code = '(args: TriggerArgs) => <Select {...args} />';
    expect(fullyInlined(code, { size: 'md', filled: true })).toBe('<Select size="md" filled />');
  });

  it('reads a destructured parameter that carries its type', () => {
    const code = '({ label }: Props) => <Chip label={label} />';
    expect(fullyInlined(code, { label: 'HDR' })).toBe('<Chip label="HDR" />');
  });

  it('does not pass an unreadable parameter list off as an empty one', () => {
    const code = '([first, second]) => <Pair a={first} />';
    expect(fullyInlined(code, { first: 1 })).toBeNull();
  });
});
