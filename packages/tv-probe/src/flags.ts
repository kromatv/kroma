interface Flags {
  url: string;
  locale: string;
  presses: number;
  items: number;
  growth: number;
  minFps: number;
  shot: string;
  tall: boolean;
  throttle: number;
}

export function flags(argv: readonly string[]): Flags {
  const value = (name: string, fallback: string): string => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? fallback : (argv[at + 1] ?? fallback);
  };
  return {
    url: value('url', ''),
    locale: value('locale', 'en'),
    presses: Number(value('keys', '24')),
    items: Number(value('items', '120')),
    growth: Number(value('growth', '3')),
    minFps: Number(value('min-fps', '20')),
    shot: value('shot', ''),
    tall: argv.includes('--tall'),
    // A television's browser is roughly six times slower than a developer
    // laptop, and a race the remote can win on a laptop is a race it loses on
    // the set.
    throttle: Number(value('throttle', '6')),
  };
}
