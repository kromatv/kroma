// Duplicated from the app rather than imported, so the kit stays a leaf package.

/** Deterministic hue in 0..359. */
export function hue(s: string): number {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + (s.codePointAt(i) ?? 0)) % 360;
  return h;
}

export function avatarGradient(name: string): string {
  const h = hue(name);
  return `linear-gradient(140deg, hsl(${h} 48% 46%), hsl(${(h + 40) % 360} 54% 26%))`;
}

export function initial(name: string): string {
  return (name?.[0] ?? '?').toUpperCase();
}

/** French-style decimal: a comma separator. */
export function decimal(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

/** Human byte size in French units: o / Ko / Mo / Go / To / Po. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${decimal(v, v >= 100 || i <= 1 ? 0 : 1)} ${units[i]}`;
}
