export const CLOCK = [
  '4 min 30s',
  '4 min',
  '3 min 30s',
  '3 min',
  '2 min 30s',
  '2 min',
  '1 min 30s',
  '1 min',
  '30s',
  'now',
];

export const REMOTE = [0, 1.2, 3.4, 2.1, 5.6, 8.2, 6.4, 9.1, 7.3, 8.8];

export const LOCAL = [4.2, 3.8, 5.1, 6.4, 5.9, 4.2, 3.1, 4.8, 6.2, 7.4];

export const traffic = REMOTE.map((remote, at) => ({
  at: CLOCK[at] ?? '',
  remote,
  local: LOCAL[at] as number,
}));

export const asleep = CLOCK.map((at) => ({ at, remote: 0, local: 0 }));

export const patchy = traffic.map((point, at) =>
  at > 2 && at < 6 ? { ...point, remote: null, local: null } : point,
);

export const weeks = ['W09', 'W10', 'W11', 'W12', 'W13', 'W14'].map((at, index) => ({
  at,
  films: [6.2, 4.1, 8.8, 3.4, 7.1, 5.5][index] as number,
  shows: [2.1, 5.6, 0, 6.8, 4.4, 9.2][index] as number,
}));

export const mbps = (value: number) => `${value.toFixed(1)} Mb/s`;

export const hours = (value: number) => `${Math.round(value)} h`;
