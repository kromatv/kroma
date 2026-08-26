import type { CSSProperties } from 'react';

// Assets and timings for the KROMA cinematic intro; its animations are in
// `animations.ts`.

export const DEFAULT_AUDIO = new URL('../../../assets/kroma-intro.mp3', import.meta.url).href;

// 4K60 HEVC only: platforms without an HEVC decoder (Firefox, software-only
// Chrome) fall back to the CSS scene via the play()-rejection path. Timings are
// read from the video's own metadata, so a re-encoded master is a drop-in swap
// (keep `-movflags +faststart`).
export const VIDEO_SOURCES = [
  {
    src: new URL('../../../assets/kroma-intro-hevc.mp4', import.meta.url).href,
    type: 'video/mp4; codecs="hvc1.1.6.L153.B0"',
  },
] as const;

// Fallback when the audio is blocked: past the 4.992s sting, so a sting that
// does play always reaches its own `ended`.
export const SAFETY_MS = 5400;
export const EXIT_MS = 850;
export const SAFETY_SLACK_MS = 1500;

export const GRAIN =
  "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>')";

export const EMBERS: ReadonlyArray<CSSProperties & { anim: string }> = [
  {
    left: '38%',
    bottom: '30%',
    width: 5,
    height: 5,
    background: '#F4B642',
    filter: 'blur(1px)',
    anim: 'kroma-ember 5.5s ease-in 1.2s infinite backwards',
  },
  {
    left: '58%',
    bottom: '34%',
    width: 4,
    height: 4,
    background: '#FFD262',
    filter: 'blur(1px)',
    anim: 'kroma-ember 6.2s ease-in 2.1s infinite backwards',
  },
  {
    left: '46%',
    bottom: '28%',
    width: 6,
    height: 6,
    background: '#F4B642',
    filter: 'blur(1.5px)',
    anim: 'kroma-ember 6.8s ease-in 1.7s infinite backwards',
  },
  {
    left: '64%',
    bottom: '31%',
    width: 3,
    height: 3,
    background: '#FFE7A8',
    filter: 'blur(1px)',
    anim: 'kroma-ember 5.9s ease-in 3s infinite backwards',
  },
  {
    left: '33%',
    bottom: '33%',
    width: 4,
    height: 4,
    background: '#F4B642',
    filter: 'blur(1px)',
    anim: 'kroma-ember 7s ease-in 2.6s infinite backwards',
  },
];
