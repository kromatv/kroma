import { useState } from 'react';

import { NavPill, type NavPillRootProps } from './nav-pill';

export const SECTIONS = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'films', label: 'Films', icon: 'movie' },
  { key: 'series', label: 'Series', icon: 'device-tv' },
  { key: 'search', label: 'Search', icon: 'search' },
] as const;

export // Wired, so Select actually moves the lens: the story's stand-in for the
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

export function Frosted() {
  const [active, setActive] = useState('films');
  return (
    <NavPill.Root size="tv">
      <NavPill.Backdrop amount={16} />
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
