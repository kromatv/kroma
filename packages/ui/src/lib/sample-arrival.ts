import type { CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchableProgress } from '@kromatv/client/watchable';

const SLICES = 120;
const EDGE = 5;

const sampleSource: CapabilitySource = {
  mount: '/api/module/tv.kroma.torrents',
  label: 'Torrents',
  icon: 'magnet',
  figures: [
    { key: 'downloaded', label: 'Téléchargé', kind: 'percent' },
    { key: 'speed', label: 'Vitesse', kind: 'rate' },
    { key: 'sources', label: 'Pairs', kind: 'ratio' },
  ],
  map: { label: 'Morceaux reçus' },
  actions: [{ key: 'cancel', label: 'Annuler' }],
};

function sampleArrival(percent: number, stalled = false): WatchableProgress {
  const whole = Math.round((percent / 100) * SLICES);
  const slices = Array.from({ length: SLICES }, (_, at) => {
    if (at < whole) return 100;
    return at < whole + EDGE ? 40 : 0;
  });
  const arriving = Array.from({ length: EDGE }, (_, at) => whole + at).filter((at) => at < SLICES);
  const downBps = stalled ? 0 : 318_000;
  const peers = stalled ? 0 : 4;
  return {
    progress: percent / 100,
    figures: { downloaded: percent / 100, speed: downBps, sources: [peers, 11] },
    slices,
    arriving,
    downBps,
    upBps: 41_000,
    peers,
    peersSeen: 11,
    pieces: slices,
  };
}

export { sampleArrival, sampleSource };
