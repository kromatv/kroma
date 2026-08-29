import { Box, color, Icon, Text } from '@kroma/ui/kit';
import { type CSSProperties, type MouseEvent, memo } from 'react';

const OPTION: CSSProperties = {
  position: 'relative',
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  margin: 0,
  padding: '8px 32px 8px 12px',
  border: 0,
  // A <button> left without one paints the UA's `buttonface`.
  background: 'transparent',
  borderRadius: 4,
  textAlign: 'left',
  cursor: 'pointer',
  outline: 'none',
  userSelect: 'none',
};

interface SearchOptionProps {
  id: string;
  option: string;
  index: number;
  selected: boolean;
  active: boolean;
  onHover: (index: number) => void;
  onPick: (option: string) => void;
}

function swallow(e: MouseEvent<HTMLButtonElement>) {
  e.preventDefault();
}

// Memoised because every prop here holds still per row, and the panel's list
// rebuilds on both of its interactions: typing moves the filter, an arrow key
// or the pointer moves the highlight. Without this boundary each of those
// re-rendered every option in a list that runs to the hundreds.
const SearchOption = memo(function SearchOption({
  id,
  option,
  index,
  selected,
  active,
  onHover,
  onPick,
}: Readonly<SearchOptionProps>) {
  return (
    // A real button, not a div: the row is a pointer target, and the keyboard
    // reaches it through the combobox input above rather than by focus, so
    // `tabIndex={-1}` keeps it out of the tab ring while the element stays
    // interactive for assistive tech.
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseEnter={() => onHover(index)}
      onMouseDown={swallow}
      onClick={() => onPick(option)}
      style={active ? { ...OPTION, background: color('tint/6') } : OPTION}
    >
      <Text variant="meta" color={selected ? 'accentText' : 'text'}>
        {option}
      </Text>
      {selected ? (
        <Box absolute right={10}>
          <Icon name="check" size={14} thickness={2.4} color="accentText" />
        </Box>
      ) : null}
    </button>
  );
});

export { SearchOption };
