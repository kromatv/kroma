const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// `surface1` is the only shape kebab-case gets wrong: a digit is not a word
// boundary, which is exactly what keeps `h265` intact.
const IRREGULAR: Readonly<Record<string, string>> = {
  surface1: 'surface-1',
  surface2: 'surface-2',
  surface3: 'surface-3',
};

/** A colour token's custom-property name, without the leading `--kroma-`. */
export const cssName = (token: string) => IRREGULAR[token] ?? kebab(token);

const alphaSuffix = (alpha: string | number) => `-${String(alpha).replace('.', '_')}`;

/** A colour token as a custom property, optionally at one alpha step. `2.5` is a
 *  legal alpha and an illegal ident, so the dot becomes an underscore. */
export const cssVar = (token: string, alpha?: string | number) =>
  `--kroma-${cssName(token)}${alpha === undefined ? '' : alphaSuffix(alpha)}`;
