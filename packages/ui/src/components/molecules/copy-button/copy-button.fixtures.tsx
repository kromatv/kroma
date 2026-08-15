import type { ButtonSize, ButtonVariant } from '#ui/components/atoms/button';

export const VARIANTS: ButtonVariant[] = [
  'primary',
  'glass',
  'ghost',
  'outline',
  'scrim',
  'danger',
  'dangerGhost',
];

export const SIZES: ButtonSize[] = ['sm', 'md', 'lg', 'tv'];

export const REGISTRY = 'https://modules.kroma.tv/registry.json';

export const BUILDS = [
  { target: 'linux-x86_64', sha: '9f2a11c0e4b8d735' },
  { target: 'darwin-aarch64', sha: '3c81be07af52d190' },
  { target: 'linux-aarch64', sha: 'd47f60a2158cb3ee' },
];
