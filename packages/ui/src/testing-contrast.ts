const luminanceChannel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!m) {
    throw new Error(`not a hex colour: ${hex}`);
  }
  const [r, g, b] = [0, 2, 4].map((i) => luminanceChannel(Number.parseInt(m.slice(i, i + 2), 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

/** `rgba` composited once over the opaque `ground`, as a `#RRGGBB` colour. */
export const blend = (rgba: string, ground: string): string => {
  const [r = 0, g = 0, b = 0, alpha = 1] = (rgba.match(/[\d.]+/g) ?? []).map(Number);
  const base = /^#([0-9a-f]{6})$/i.exec(ground)?.[1] ?? '';
  const channel = (value: number, i: number) =>
    Math.round(value * alpha + Number.parseInt(base.slice(i, i + 2), 16) * (1 - alpha));
  return `#${[channel(r, 0), channel(g, 2), channel(b, 4)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
};

/** The WCAG contrast ratio of two `#RRGGBB` colours. */
export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};
