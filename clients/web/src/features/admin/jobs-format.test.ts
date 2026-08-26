import { afterEach, describe, expect, it, vi } from 'vitest';
import { clock, dur, rel } from './jobs-format';

afterEach(() => vi.useRealTimers());

// Compare against a locally-constructed formatter, pinned to the same locale the
// call passes, so no assertion depends on the runtime's default.
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const NOW = new Date('2026-01-01T12:00:00Z').getTime();

describe('rel', () => {
  it('formats sub-minute diffs in seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(rel(NOW + 3000, 'en')).toBe(rtf.format(3, 'second'));
    expect(rel(NOW - 5000, 'en')).toBe(rtf.format(-5, 'second'));
  });

  it('rolls up to minutes / hours / days at each boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(rel(NOW + 60_000, 'en')).toBe(rtf.format(1, 'minute')); // exactly 1 min
    expect(rel(NOW + 90_000, 'en')).toBe(rtf.format(2, 'minute'));
    expect(rel(NOW + 7_200_000, 'en')).toBe(rtf.format(2, 'hour'));
    expect(rel(NOW + 3 * 86_400_000, 'en')).toBe(rtf.format(3, 'day'));
  });
});

describe("rel in the reader's language", () => {
  // The regression this pins: the jobs page read `Intl`'s default, so a French
  // account on an English browser got "in 8 minutes" beside "Prochaine".
  it('follows the locale it is given, not the runtime default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(rel(NOW + 480_000, 'fr')).toBe('dans 8 minutes');
    expect(rel(NOW - 360_000, 'fr')).toBe('il y a 6 minutes');
  });
});

describe('dur', () => {
  it('shows whole milliseconds below one second', () => {
    expect(dur(0)).toBe('0 ms');
    expect(dur(820)).toBe('820 ms');
  });

  it('shows one decimal of seconds below a minute', () => {
    expect(dur(1000)).toBe('1.0 s');
    expect(dur(4300)).toBe('4.3 s');
    expect(dur(59_900)).toBe('59.9 s');
  });

  it('shows "M min SS s" from a minute up, zero-padding seconds', () => {
    expect(dur(60_000)).toBe('1 min 00 s');
    expect(dur(125_000)).toBe('2 min 05 s');
  });

  it('rounds to whole seconds first, avoiding a stray "60 s" tail', () => {
    expect(dur(119_600)).toBe('2 min 00 s');
  });
});

describe('clock', () => {
  it('renders an hh:mm wall-clock time', () => {
    expect(clock(NOW, 'en')).toMatch(/\d{1,2}:\d{2}/);
  });
});
