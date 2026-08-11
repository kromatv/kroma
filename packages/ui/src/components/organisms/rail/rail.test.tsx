// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chip } from '#ui/components/atoms/chip';
import { Text } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { Rail } from './rail';

afterEach(cleanup);

// More children than one chunk (RAIL_CHUNK = 8).
const CHIPS = Array.from({ length: 14 }, (_, at) => `Chip ${at + 1}`).map((label) => (
  <Text key={label}>{label}</Text>
));

describe('<Rail> parts', () => {
  it('is a namespace of parts, not a component', () => {
    expect(typeof Rail).toBe('object');
    expect(Object.keys(Rail).sort()).toEqual(['List', 'Root', 'Title']);
  });

  it('renders the same band from the title sugar and from the part', () => {
    const { container: sugar } = render(onScreen(<Rail.Root title="Reprendre">{CHIPS}</Rail.Root>));
    const written = sugar.innerHTML;

    cleanup();
    const { container: parts } = render(
      onScreen(
        <Rail.Root>
          <Rail.Title>Reprendre</Rail.Title>
          {CHIPS}
        </Rail.Root>,
      ),
    );
    expect(parts.innerHTML).toBe(written);
  });

  it('lets the title carry its own type instead of being styled through the Root', () => {
    const size = (text: string) => {
      const nodes = Array.from(document.querySelectorAll('div')).filter(
        (el) => el.textContent === text,
      );
      return getComputedStyle(nodes.at(-1) as HTMLElement).fontSize;
    };
    render(
      onScreen(
        <Rail.Root>
          <Rail.Title>Par defaut</Rail.Title>
          <Rail.Title variant="subheadingTv">Plus grand</Rail.Title>
        </Rail.Root>,
      ),
    );
    expect(size('Plus grand')).not.toBe(size('Par defaut'));
  });

  it('refuses a part written outside a rail', () => {
    expect(() => render(<Rail.Title>Orpheline</Rail.Title>)).toThrow(
      '<Rail.Title> must be used inside <Rail.Root>',
    );
  });

  it('gives the row to a <Rail.List> when one is written', () => {
    render(
      onScreen(
        <Rail.Root title="Films">
          <Rail.List pitch={200} height={120}>
            {CHIPS}
          </Rail.List>
        </Rail.Root>,
      ),
    );
    expect(screen.getAllByText('Chip 1').length).toBeGreaterThan(0);
  });
});

describe('<Rail> mounting', () => {
  it('grows from one chunk by default, so a long row costs a screenful', () => {
    render(onScreen(<Rail.Root>{CHIPS}</Rail.Root>));
    // getAllByText, not getByText: react-native-web renders a Text as nested
    // nodes that each carry the string.
    expect(screen.getAllByText('Chip 8').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Chip 9')).toHaveLength(0);
  });

  it('is a plain scrolled row, whole, where no navigator is mounted', () => {
    // No onScreen(): the browser app is a mouse-and-keyboard page, and there is
    // no focus for a window to grow towards.
    render(<Rail.Root>{CHIPS}</Rail.Root>);
    for (const at of [1, 8, 9, 14]) {
      expect(screen.getAllByText(`Chip ${at}`).length).toBeGreaterThan(0);
    }
  });

  it('mounts every child under grow={false}, for a strip of controls', () => {
    // The browse screens' sort + genre filters are one Rail: growing it would
    // open the strip on its first eight chips and read as missing filters.
    render(onScreen(<Rail.Root grow={false}>{CHIPS}</Rail.Root>));
    for (const at of [1, 8, 9, 14]) {
      expect(screen.getAllByText(`Chip ${at}`).length).toBeGreaterThan(0);
    }
  });
});

describe('<Rail> focus stops', () => {
  // Counted by NAME: a rail's own paging arrows are pointer affordances the
  // D-pad never visits, so what has to hold is one stop per tile.
  const names = ['Un', 'Deux', 'Trois'];
  const tiles = names.map((label) => <Chip key={label} label={label} onPress={vi.fn()} />);
  const stops = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[tabindex]')).filter((el) =>
      names.includes(el.getAttribute('aria-label') ?? ''),
    );

  it('is one stop per tile and none of its own', () => {
    const { container } = render(onScreen(<Rail.Root title="Genres">{tiles}</Rail.Root>));
    expect(stops(container)).toHaveLength(3);
  });

  it('is the same count through <Rail.List>', () => {
    const { container } = render(
      onScreen(
        <Rail.Root title="Genres">
          <Rail.List pitch={200} height={120}>
            {tiles}
          </Rail.List>
        </Rail.Root>,
      ),
    );
    expect(stops(container)).toHaveLength(3);
  });
});
