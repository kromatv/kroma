import { Box, classes, Icon, styles, Text } from '@kroma/ui/kit';
import { type MouseEvent, memo } from 'react';

// A <button> left without a background paints the UA's `buttonface`.
const s = styles({
  option: {
    position: 'relative',
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    m: 0,
    pt: 8,
    pr: 32,
    pb: 8,
    pl: 12,
    borderWidth: 0,
    bg: 'transparent',
    radius: 'xs',
    textAlign: 'left',
    cursor: 'pointer',
    outlineStyle: 'none',
    userSelect: 'none',
  },
  active: { bg: 'tint/6' },
});

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
      className={classes(s.option, active ? s.active : null)}
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
