import { z } from 'zod';

const Dependencies = z.record(z.string(), z.string()).default({});

const Manifest = z.object({
  dependencies: Dependencies,
  devDependencies: Dependencies,
  optionalDependencies: Dependencies,
});

const ALIAS = /^npm:(@?[^@]+)@(.+)$/;

/** A dependency installed under another package's name: `"react-native": "npm:react-native-tvos@0.88.0-0"`. */
export interface Alias {
  name: string;
  target: string;
  range: string;
}

/** Every alias a `package.json` declares, in any of its install-time dependency fields. */
export function aliasesOf(manifest: unknown): Alias[] {
  const { dependencies, devDependencies, optionalDependencies } = Manifest.parse(manifest);
  return Object.entries({ ...dependencies, ...devDependencies, ...optionalDependencies }).flatMap(
    ([name, spec]) => {
      const match = ALIAS.exec(spec);
      return match?.[1] && match[2] ? [{ name, target: match[1], range: match[2] }] : [];
    },
  );
}

/**
 * The `yarn.lock` with each alias keyed under its own name, as Yarn writes it.
 * Bun 1.4.0's `install --yarn` keys an alias under its target instead
 * (`react-native-tvos@npm:react-native-tvos@0.88.0-0`), and Snyk then refuses
 * the lockfile as out of sync with the `package.json` that declares it.
 */
export function keyAliases(lock: string, aliases: readonly Alias[]): string {
  return aliases.reduce((text, { name, target, range }) => {
    const own = `"${name}@npm:${target}@${range}"`;
    return text.includes(own) ? text : text.replace(`"${target}@npm:${target}@${range}"`, own);
  }, lock);
}
