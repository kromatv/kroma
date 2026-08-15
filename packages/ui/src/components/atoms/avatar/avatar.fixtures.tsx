export const NAMES = ['Marie Curie', 'jean.dupont', 'ada_lovelace', 'Alan Turing'];

export const SHAPES = [
  { label: '0 · square', props: { roundness: 0 } },
  { label: '0.16 · default', props: {} },
  { label: '0.33', props: { roundness: 0.33 } },
  { label: 'circle · 0.5', props: { circle: true } },
] as const;

export const SIZES = [40, 64, 96, 140];
