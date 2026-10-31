import { dirname, relative } from 'node:path';
import {
  REMOTE_ENTRY,
  REMOTE_SHARED,
  REMOTE_STYLES,
  SHARED_GLOBAL,
  SHARED_MODULES,
  sharedKey,
  WHOLE_NAMESPACE,
} from '@kromatv/module-sdk/shared';
import { init, parse } from 'es-module-lexer';
import MagicString from 'magic-string';
import type { Plugin, Rolldown } from 'vite';
import { fieldsOf, namesTaken, takeBraces, takeNamespace } from './import-clause';

export interface RemoteOptions {
  /** The file whose default export is the `KromaModule`. */
  entry: string;
  manifestPath: string;
  localesDir: string;
}

const HELPER = 'virtual:kroma-shared';
const RESOLVED_HELPER = `\0${HELPER}`;
const HELPER_FN = '__kroma_shared';

const OPTIONS_ONLY_CALL = /\bdefineModule\s*\(\s*\{/;

const STYLES_HREF = JSON.stringify(`./${REMOTE_STYLES}`);

const LINK_STYLES = [
  '(function () {',
  `  var href = new URL(${STYLES_HREF}, import.meta.url).href;`,
  "  if (document.querySelector('link[href=\"' + href + '\"]')) return;",
  "  var link = document.createElement('link');",
  "  link.rel = 'stylesheet';",
  '  link.href = href;',
  '  document.head.appendChild(link);',
  '})();',
].join('\n');
const SCRIPT = /\.[cm]?[jt]sx?$/;

function posix(path: string): string {
  return path.replaceAll('\\', '/');
}

function relativeImport(from: string, to: string): string {
  const rel = posix(relative(dirname(from), to));
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function clean(id: string): string {
  return id.split('?', 1)[0] ?? id;
}

/** `{ a, b as c }` → the destructuring pattern that reads it off a namespace. */
function pattern(braces: string): string {
  const fields = fieldsOf(braces).map(([name, alias]) => (alias ? `${name}: ${alias}` : name));
  return `{ ${fields.join(', ')} }`;
}

function rewriteImport(statement: string, key: string, tmp: string): string {
  const take = `const ${tmp} = ${HELPER_FN}(${JSON.stringify(key)});`;
  const afterImport = statement.slice('import'.length).trimStart();
  if (afterImport.startsWith("'") || afterImport.startsWith('"')) {
    return `${HELPER_FN}(${JSON.stringify(key)});`;
  }
  const fromAt = statement.lastIndexOf(' from ');
  if (!statement.startsWith('import') || fromAt < 0)
    throw new Error(`cannot rewrite: ${statement}`);
  const lines = [take];
  const [braces, afterBraces] = takeBraces(statement.slice('import'.length, fromAt).trim());
  if (braces) lines.push(`const ${pattern(braces)} = ${tmp};`);
  const [ns, afterNs] = takeNamespace(afterBraces);
  if (ns) lines.push(`const ${ns} = ${tmp};`);
  const def = afterNs.replaceAll(',', '').trim();
  if (def) lines.push(`const ${def} = ${tmp}.default;`);
  return lines.join(' ');
}

function rewriteReexport(statement: string, key: string, tmp: string): string {
  const take = `const ${tmp} = ${HELPER_FN}(${JSON.stringify(key)});`;
  const [braces] = takeBraces(statement);
  if (!braces) {
    throw new Error(`\`export * from '${key}'\` is not supported for a package the host provides`);
  }
  const fields = fieldsOf(braces).map(
    ([name, alias]) => `export const ${alias ?? name} = ${tmp}.${name};`,
  );
  return [take, ...fields].join(' ');
}

type Reads = Map<string, Set<string>>;

function note(reads: Reads, key: string, names: string[]): void {
  const into = reads.get(key) ?? new Set<string>();
  for (const name of names) into.add(name);
  reads.set(key, into);
}

function entryReads(
  bundle: Rolldown.OutputBundle,
  reads: Map<string, Reads>,
): Record<string, string[]> {
  const merged: Reads = new Map();
  const seen = new Set<string>();
  const queue = [REMOTE_ENTRY];
  for (const file of queue) {
    const chunk = bundle[file];
    if (seen.has(file) || chunk?.type !== 'chunk') continue;
    seen.add(file);
    queue.push(...chunk.imports);
    for (const id of chunk.moduleIds) {
      for (const [key, names] of reads.get(id) ?? []) note(merged, key, [...names]);
    }
  }
  return Object.fromEntries(
    [...merged]
      .sort(([a], [b]) => byCodeUnit(a, b))
      .map(([key, names]) => [key, [...names].sort(byCodeUnit)]),
  );
}

function byCodeUnit(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * The build half of the host contract: the plugins `kroma build` runs a module
 * frontend through. The first injects `module.json` and the locale catalogs into
 * the `defineModule({ ... })` call the way the compiled-in tier did. The second
 * rewrites every import of a package the host provides into a read from the
 * host's global, so the bundle carries none of them and one React, one design
 * system and one query cache live on the page, and writes `REMOTE_SHARED`
 * beside the entry: the part of that global the entry reads as it loads.
 */
export function kromaRemote(options: RemoteOptions): Plugin[] {
  const reads = new Map<string, Reads>();
  const entry = posix(options.entry);
  const manifestImport = relativeImport(options.entry, options.manifestPath);
  const localesGlob = `${relativeImport(options.entry, options.localesDir)}/*.json`;

  const manifest: Plugin = {
    name: 'kroma-remote:manifest',
    enforce: 'pre',
    transform(code, id) {
      if (posix(clean(id)) !== entry || !OPTIONS_ONLY_CALL.test(code)) return null;
      const injected = `import __kromaManifest from '${manifestImport}';\n${code}`.replace(
        OPTIONS_ONLY_CALL,
        `defineModule({ manifest: __kromaManifest, locales: import.meta.glob('${localesGlob}', { eager: true, import: 'default' }),`,
      );
      return { code: injected, map: null };
    },
  };

  const shared: Plugin = {
    name: 'kroma-remote:shared',
    enforce: 'post',
    resolveId(id, importer) {
      if (id === HELPER) return RESOLVED_HELPER;
      const key = sharedKey(id);
      if (key) return { id: `${HELPER}:${key}`, external: true };
      if (id.startsWith('@kromatv/')) {
        this.error(
          `${importer ?? 'a module file'} imports '${id}', which the host does not provide. The SDK packages carry types only; a page may import ${SHARED_MODULES.join(', ')} and any @kromatv/client/<domain>.`,
        );
      }
      return null;
    },
    load(id) {
      if (id !== RESOLVED_HELPER) return null;
      return [
        `export function ${HELPER_FN}(key) {`,
        `  const shared = globalThis[${JSON.stringify(SHARED_GLOBAL)}];`,
        '  const mod = shared && shared[key];',
        '  if (!mod) throw new Error("kroma module: the host provides no " + JSON.stringify(key) + "; this bundle only runs inside a KROMA client");',
        '  return mod;',
        '}',
      ].join('\n');
    },
    async transform(code, id) {
      const file = clean(id);
      if (id.startsWith('\0') || !SCRIPT.test(file)) return null;
      if (!code.includes('import') && !code.includes('export')) return null;
      await init();
      const [imports, exports] = parse(code, file);
      if (
        posix(file) === entry &&
        !exports.some((e) => e.type !== 'reexport-all' && e.name === 'default')
      ) {
        this.error(`${file}: the module entry must \`export default defineModule({ ... })\``);
      }
      const s = new MagicString(code);
      const taken: Reads = new Map();
      reads.set(id, taken);
      let count = 0;
      for (const imp of imports) {
        if (!imp.specifier) continue;
        const key = sharedKey(imp.specifier);
        if (!key) continue;
        const tmp = `__ks${count++}`;
        if (imp.type === 'dynamic') {
          note(taken, key, [WHOLE_NAMESPACE]);
          s.overwrite(
            imp.importStart,
            imp.importEnd,
            `Promise.resolve(${HELPER_FN}(${JSON.stringify(key)}))`,
          );
          continue;
        }
        const statement = code.slice(imp.importStart, imp.importEnd);
        note(taken, key, namesTaken(statement));
        const rewritten = statement.startsWith('export')
          ? rewriteReexport(statement, key, tmp)
          : rewriteImport(statement, key, tmp);
        s.overwrite(imp.importStart, imp.importEnd, rewritten);
      }
      if (count === 0) return null;
      s.prepend(`import { ${HELPER_FN} } from ${JSON.stringify(HELPER)};\n`);
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
    generateBundle(_options, bundle) {
      const entry = bundle[REMOTE_ENTRY];
      if (entry?.type !== 'chunk') return;
      this.emitFile({
        type: 'asset',
        fileName: REMOTE_SHARED,
        source: `${JSON.stringify(entryReads(bundle, reads), null, 2)}\n`,
      });
      if (REMOTE_STYLES in bundle) entry.code = `${LINK_STYLES}\n${entry.code}`;
    },
  };

  return [manifest, shared];
}
