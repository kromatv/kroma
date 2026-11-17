const STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** How long ago `seconds` (a Unix time) was, in words: "just now", "3 minutes ago", "yesterday". */
export function ago(seconds: number, now: number = Date.now() / 1000): string {
  const elapsed = Math.max(0, now - seconds);
  const step = STEPS.find(([, size]) => elapsed >= size);
  return step ? relative.format(-Math.floor(elapsed / step[1]), step[0]) : 'just now';
}
