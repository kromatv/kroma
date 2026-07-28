/** The one method of Babel's config API this file touches. Declared rather than
 *  imported: `@babel/core` ships no types of its own (they live in the separate
 *  `@types/babel__core`), and a four-line config does not justify a dependency
 *  whose only job is to describe `cache`. */
interface ConfigAPI {
  cache: (forever: boolean) => void;
}

export default function tvNativeBabelConfig(api: ConfigAPI) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
}
