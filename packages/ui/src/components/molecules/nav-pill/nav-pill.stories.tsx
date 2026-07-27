import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { NavPill, NavPillItem, type NavPillProps } from './nav-pill';

const SECTIONS = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'films', label: 'Films', icon: 'movie' },
  { key: 'series', label: 'Series', icon: 'device-tv' },
  { key: 'search', label: 'Search', icon: 'search' },
] as const;

/** Wired, so Select actually moves the lens: the story's stand-in for the
 * navigation a press performs in the apps. */
function Switcher(props: Readonly<Omit<NavPillProps, 'children'>>) {
  const [active, setActive] = useState('home');
  return (
    <NavPill {...props}>
      {SECTIONS.map((section) => (
        <NavPillItem
          key={section.key}
          icon={section.icon}
          label={section.label}
          active={section.key === active}
          onPress={() => setActive(section.key)}
        />
      ))}
    </NavPill>
  );
}

export default story({
  name: 'NavPill',
  group: 'Layout',
  docs: 'The floating section switcher: a capsule of icon + label items with the current section in its own amber lens. The Apple TV top nav and the iPhone tab bar are this one design at two distances, which is what `size` means: **tv** keeps every label (a viewer is reading, and the capsule must hold its width under the travelling ring), **sm** labels only the active item (a thumb is on the glass). On glass the capsule is also a slider: land a finger (or mouse) and travel, and the lens and amber ink chase as a preview - lifting commits the section it rests on, the native tab bar drag; a tap still works as ever, and a television never sees any of it. The options bend the defaults without forking the design: `labels` overrides the size policy (`none` below is the icon-only bar), `slide={false}` keeps a capsule tap-only, and `onPreview` reports each crossing for the host to hang haptics on. Compound, shadcn-fashion: items are children, so a host can ref one for focus wiring or badge another - things an `items` array cannot say.',
  usage: `<NavPill size="tv">
  <NavPillItem icon="home" label="Home" active onPress={goHome} />
  <NavPillItem icon="search" label="Search" onPress={goSearch} />
</NavPill>`,
  guidelines: {
    do: [
      'Keep it to a handful of top-level sections - it is the map, not the territory.',
      "Pass the iPhone's BlurView as `backdrop`; the fill thins so it reads through.",
    ],
    dont: [
      "Don't mark two items `active`: the lens is where you ARE.",
      "Don't blur on a television - Tizen composites it on the CPU and pays in frames, which is why the default fill is solid.",
    ],
  },
  matrix: false,
  args: {},
  render: () => (
    <Box gap={28} align="flex-start">
      <Switcher size="tv" />
      <Switcher size="sm" />
      <Switcher size="sm" labels="none" />
    </Box>
  ),
});
