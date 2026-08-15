import type { ReactNode } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Ground } from '#ui/components/atoms/ground';

import { liveMeters } from '#ui/components/organisms/player/player.fixture';

import type { PlayerStats } from '#ui/components/organisms/player/types';

export /**
 * The player surface the panel is positioned against. The panel pins itself
 * 34pt from the left and 100pt from the top and carries its own width, so all
 * the story owes it is a surface deep enough to be read in - and no width of its
 * own, which the canvas is already deciding (see `width` below).
 */
function Surface({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Ground tone="dark">
      <Box minH={620} bg="bg">
        {children}
      </Box>
    </Ground>
  );
}

export // A stream losing its connection: bandwidth sliding under the bitrate it needs
// while the buffer drains. Deterministic in its own tick, so the scene captures
// identically every time.
function starvingStats(): () => PlayerStats {
  let tick = 0;
  return () => {
    const at = tick++;
    // Bandwidth decays past the stream's demand; buffer follows it down, slower,
    // the way a real buffer drains once supply drops below demand.
    const bandwidth = 46_000 - Math.min(at, 60) * 460;
    const bitrate = 28_400 + Math.sin(at / 6) * 900;
    const buffer = Math.max(0.4, 22 - Math.min(at, 70) * 0.3);
    return {
      mode: 'Direct · HEVC passthrough',
      resolution: '3840×2160',
      videoCodec: 'HEVC Main 10 10-bit HDR',
      fps: '23.98 fps',
      audioFormat: 'EAC3 5.1 (eng)',
      dropped: `${18 + Math.floor(at / 8)} / ${42_000 + at * 24}`,
      extra: [
        { group: 'Transport', label: 'Stalls', value: `${Math.floor(at / 20)} (2.4s)` },
        { group: 'Transport', label: 'Downloaded', value: `${(4.2 + at / 90).toFixed(2)} Go` },
        { group: 'Client', label: 'State', value: 'HAVE_FUTURE · NET_LOADING' },
        { group: 'Client', label: 'Connection', value: '3.1 Mb/s · 4g' },
      ],
      meters: liveMeters({ bandwidth, bitrate, buffer }),
    };
  };
}
