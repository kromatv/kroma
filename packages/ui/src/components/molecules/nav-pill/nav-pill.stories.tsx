import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Frost } from '#ui/components/atoms/frost';
import { NavPill, type NavPillRootProps } from './nav-pill';

const SECTIONS = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'films', label: 'Films', icon: 'movie' },
  { key: 'series', label: 'Series', icon: 'device-tv' },
  { key: 'search', label: 'Search', icon: 'search' },
] as const;

// Wired, so Select actually moves the lens: the story's stand-in for the
// navigation a press performs in the apps.
function Switcher(props: Readonly<Omit<NavPillRootProps, 'children'>>) {
  const [active, setActive] = useState('home');
  return (
    <NavPill.Root {...props}>
      {SECTIONS.map((section) => (
        <NavPill.Item
          key={section.key}
          icon={section.icon}
          label={section.label}
          active={section.key === active}
          onPress={() => setActive(section.key)}
        />
      ))}
    </NavPill.Root>
  );
}

// The composed form: a backdrop is a part, so it sits behind the items and the
// capsule thins its own fill without being told.
function Frosted() {
  const [active, setActive] = useState('films');
  return (
    <NavPill.Root size="tv">
      <NavPill.Backdrop>
        <Frost amount={16} />
      </NavPill.Backdrop>
      {SECTIONS.map((section) => (
        <NavPill.Item
          key={section.key}
          icon={section.icon}
          label={section.label}
          active={section.key === active}
          onPress={() => setActive(section.key)}
        />
      ))}
    </NavPill.Root>
  );
}

export default story({
  name: 'NavPill',
  group: 'Layout',
  docs: 'The floating section switcher: a capsule of icon + label items with the current section in its own amber lens. The Apple TV top nav and the iPhone tab bar are this one design at two distances, which is what `size` means: **tv** keeps every label (a viewer is reading, and the capsule must hold its width under the travelling ring), **sm** labels only the active item (a thumb is on the glass). On glass the capsule is also a slider: land a finger (or mouse) and travel, and the lens and amber ink chase as a preview - lifting commits the section it rests on, the native tab bar drag; a tap still works as ever, and a television never sees any of it. `labels` overrides the size policy (`none` below is the icon-only bar) and stays on the Root because it has to be the same answer for every item; `slide={false}` keeps a capsule tap-only, and `onPreview` reports each crossing for the host to hang haptics on. Composed: `<NavPill.Item>` is a part, so a host can ref one for focus wiring or badge another - things an `items` array cannot say - and `<NavPill.Backdrop>` is where a blur goes.',
  usage: `<NavPill.Root size="tv">
  <NavPill.Item icon="home" label="Accueil" active onPress={goHome} />
  <NavPill.Item icon="search" label="Rechercher" onPress={goSearch} />
</NavPill.Root>

<NavPill.Root size="sm">
  <NavPill.Backdrop>
    <BlurView intensity={60} style={StyleSheet.absoluteFill} />
  </NavPill.Backdrop>
  <NavPill.Item icon="home" label="Accueil" active onPress={goHome} />
</NavPill.Root>`,
  guidelines: {
    do: [
      'Keep it to a handful of top-level sections - it is the map, not the territory.',
      "Pass the iPhone's BlurView as a `<NavPill.Backdrop>`; the fill thins so it reads through.",
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
      <Frosted />
    </Box>
  ),
});
