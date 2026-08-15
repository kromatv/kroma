import type { ColorValue } from '#ui/core';

export // Three categories with their own hues, the way the genre screen derives them
// from the name. The kit does not decide the colours; the screen does.
const CATEGORIES: readonly {
  label: string;
  meta: string;
  accent: ColorValue;
  tint: readonly [string, string];
  wash: string;
}[] = [
  {
    label: 'Science fiction',
    meta: '128 titles',
    accent: '#86A8FF',
    tint: ['#2A3358', '#12141F'],
    wash: 'linear-gradient(0deg, rgba(18,20,31,0.92) 0%, rgba(18,20,31,0.55) 45%, rgba(18,20,31,0.08) 100%)',
  },
  {
    label: 'Horror',
    meta: '54 titles',
    accent: '#E56F4A',
    tint: ['#3E1A1C', '#150E10'] as const,
    wash: 'linear-gradient(0deg, rgba(21,14,16,0.92) 0%, rgba(21,14,16,0.55) 45%, rgba(21,14,16,0.08) 100%)',
  },
  {
    label: 'Documentary',
    meta: '212 titles',
    accent: '#5FD3C4',
    tint: ['#16342E', '#0B1614'] as const,
    wash: 'linear-gradient(0deg, rgba(11,22,20,0.92) 0%, rgba(11,22,20,0.55) 45%, rgba(11,22,20,0.08) 100%)',
  },
];
