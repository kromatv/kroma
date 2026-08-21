// @vitest-environment jsdom
import { IconFlask } from '@tabler/icons-react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type ChannelCard, ChannelNav } from './channel-nav.tsx';

const card = (over: Partial<ChannelCard> = {}): ChannelCard => ({
  id: 'canary',
  icon: IconFlask,
  title: 'Canary',
  version: '0.1.39',
  at: '2026-08-20T19:14:35Z',
  cadence: 'every push',
  count: 19,
  ...over,
});

afterEach(cleanup);

describe('ChannelNav', () => {
  it('jumps to a channel with a plain anchor, so it costs no JS', () => {
    render(<ChannelNav cards={[card()]} />);

    expect(screen.getByRole('link').getAttribute('href')).toBe('#canary');
  });

  it('renders one card per channel, however many arrive', () => {
    render(<ChannelNav cards={[card(), card({ id: 'stable', title: 'Stable' })]} />);

    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('shows an em dash for a channel that holds no build yet', () => {
    render(<ChannelNav cards={[card({ version: null, at: null })]} />);

    expect(screen.getByText('—')).toBeDefined();
  });

  it('shows the moment a build was made beside how often the channel moves', () => {
    render(<ChannelNav cards={[card()]} />);

    expect(screen.getByText('every push', { exact: false })).toBeDefined();
    expect(screen.getByRole('link').textContent).toContain('19');
  });
});
