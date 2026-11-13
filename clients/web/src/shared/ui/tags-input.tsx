import {
  Chip,
  Icon,
  type IconName,
  InputGroup,
  sharedStyle,
  styles,
  useControlMetrics,
  useStyleScope,
  useStyles,
} from '@kromatv/ui/kit';
import { useRef, useState } from 'react';
import type { StyleProp, TextInput, TextStyle } from 'react-native';
import { cutTags, withTags } from '#web/shared/lib/tags';

const ENTRY_MIN = 96;

const sDefinition = styles({
  shell: { flexWrap: 'wrap', rowGap: 0 },
  head: { pl: 0 },
  tag: { pl: 0, py: 6 },
});

/** A list of short names typed into one entry. Each becomes a tag when a
 * separator or Enter closes it, and the entry follows the last tag on its
 * line, inside the same shell, moving to the next line only when that one has
 * too little room left. A press on a tag takes it away and hands the caret
 * back to the entry, and a name still being typed is kept when the entry
 * loses focus. `separators` is every
 * character that closes a name. The caret stays in the entry after Enter,
 * which a browser would otherwise answer by taking the focus away. */
export function TagsInput({
  label,
  value,
  onValueChange,
  placeholder,
  icon,
  separators = ',\n',
  textStyle,
}: Readonly<{
  label: string;
  value: readonly string[];
  onValueChange: (next: string[]) => void;
  placeholder?: string;
  icon?: IconName;
  separators?: string;
  textStyle?: StyleProp<TextStyle>;
}>) {
  const s = useStyles(sDefinition);
  const scope = useStyleScope();
  const metrics = useControlMetrics();
  const [draft, setDraft] = useState('');
  const entry = useRef<TextInput>(null);
  const entered = useRef(false);
  const led = Boolean(icon) || value.length > 0;
  const inset = sharedStyle(`tags-input:inset:${metrics.py}`, { pl: metrics.py }, scope);

  const add = (names: readonly string[]) => {
    const next = withTags(value, names);
    if (next.length !== value.length) onValueChange(next);
  };
  const type = (text: string) => {
    const { closed, rest } = cutTags(text, separators);
    if (closed.length > 0) add(closed);
    setDraft(rest);
  };
  const close = () => {
    add([draft]);
    setDraft('');
  };
  const enter = () => {
    entered.current = true;
    close();
  };
  const remove = (tag: string) => {
    onValueChange(value.filter((kept) => kept !== tag));
    entry.current?.focus();
  };
  const leave = () => {
    if (entered.current) {
      entered.current = false;
      entry.current?.focus();
      return;
    }
    close();
  };

  return (
    <InputGroup.Root label={label} style={led ? [s.shell, inset] : null}>
      {icon ? (
        <InputGroup.Addon style={s.head}>
          <Icon name={icon} size={18} color="textDim" />
        </InputGroup.Addon>
      ) : null}
      {value.map((tag) => (
        <InputGroup.Addon key={tag} style={s.tag}>
          <Chip variant="surface" label={tag} onPress={() => remove(tag)}>
            <Icon name="x" size={12} color="textDim" />
          </Chip>
        </InputGroup.Addon>
      ))}
      <InputGroup.Input
        value={draft}
        onValueChange={type}
        onSubmit={enter}
        onBlur={leave}
        entryRef={entry}
        placeholder={placeholder}
        textStyle={textStyle}
        minW={ENTRY_MIN}
        {...(led ? { pl: 0 } : null)}
      />
    </InputGroup.Root>
  );
}
