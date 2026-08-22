// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModuleEntry } from '#site/catalog';
import { ModuleCard } from './module-card.tsx';

const entry = (over: Record<string, unknown> = {}) =>
  ModuleEntry.parse({
    id: 'tv.kroma.torrents',
    name: 'Torrent downloads',
    version: '0.3.0',
    description: 'The embedded librqbit download engine + the downloads queue.',
    url: 'https://modules.kroma.tv/tv.kroma.torrents-0.3.0.kmod',
    sha256: '5770e4a5'.padEnd(64, '0'),
    ...over,
  });

afterEach(cleanup);

describe('ModuleCard', () => {
  it('keeps a long name on one run of text when the badges fill the row', () => {
    render(
      <ModuleCard
        module={entry({
          contributes: [
            { point: 'a/client' },
            { point: 'b/grab' },
            { point: 'c/db' },
            { point: 'd/vpn' },
          ],
        })}
      />,
    );

    expect(screen.getByText('Torrent downloads')).toBeDefined();
  });

  it('wraps the header rather than shrinking the name to nothing', () => {
    render(<ModuleCard module={entry({ contributes: [{ point: 'a/client' }] })} />);

    const box = screen.getByText('Torrent downloads').parentElement as HTMLElement;
    const header = box.parentElement as HTMLElement;

    // A width to hold and room to take: without these the badges crushed the
    // name to zero and it wrapped one letter per line.
    expect(getComputedStyle(box).flexBasis).toBe('180px');
    expect(getComputedStyle(box).flexGrow).toBe('1');
    expect(getComputedStyle(header).flexWrap).toBe('wrap');
  });

  it('shows the module id and its version', () => {
    render(<ModuleCard module={entry()} />);

    expect(screen.getByText('tv.kroma.torrents')).toBeDefined();
    expect(screen.getByText('v0.3.0')).toBeDefined();
  });
});
