import { dirname, relative } from 'node:path';
import {
  REMOTE_ENTRY,
  REMOTE_STYLES,
  SHARED_GLOBAL,
  SHARED_MODULES,
  sharedKey,
} from '@kroma/module-sdk/shared';
import { init, parse } from 'es-module-lexer';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';

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

/** `b as c` → `['b', 'c']`; `b` → `['b', undefined]`. */
function splitAs(field: string): [string, string | undefined] {
  const words = field.split(' ').filter(Boolean);
  const as = words.indexOf('as');
  if (as < 0) return [words.join(''), undefined];
  return [words.slice(0, as).join(''), words.slice(as + 1).join('')];
}

function fieldsOf(braces: string): [string, string | undefined][] {
  return braces
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(splitAs);
}

/** `{ a, b as c }` → the destructuring pattern that reads it off a namespace. */
function pattern(braces: string): string {
  const fields = fieldsOf(braces).map(([name, alias]) => (alias ? `${name}: ${alias}` : name));
  return `{ ${fields.join(', ')} }`;
}

/** The `{ ... }` group in an import clause, and the clause without it. */
function takeBraces(clause: string): [string | null, string] {
  const open = clause.indexOf('{');
  const close = clause.indexOf('}');
  if (open < 0 || close < open) return [null, clause];
  return [clause.slice(open, close + 1), `${clause.slice(0, open)}${clause.slice(close + 1)}`];
}

/** The `* as ns` binding in an import clause, and the clause without it. */
function takeNamespace(clause: string): [string | null, string] {
  const star = clause.indexOf('*');
  if (star < 0) return [null, clause];
  const [, ns] = splitAs(clause.slice(star + 1).split(',')[0] ?? '');
  const rest =
    clause.slice(0, star) +
    clause
      .slice(star + 1)
      .split(',')
      .slice(1)
      .join(',');
  return [ns ?? null, rest];
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

/**
 * The build half of the host contract: the plugins `kroma build` runs a module
 * frontend through. The first injects `module.json` and the locale catalogs into
 * the `defineModule({ ... })` call the way the compiled-in tier did. The second
 * rewrites every import of a package the host provides into a read from the
 * host's global, so the bundle carries none of them and one React, one design
 * system and one query cache live on the page.
 */
export function kromaRemote(options: RemoteOptions): Plugin[] {
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
      if (id.startsWith('@kroma/')) {
        this.error(
          `${importer ?? 'a module file'} imports '${id}', which the host does not provide. The SDK packages carry types only; a page may import ${SHARED_MODULES.join(', ')} and any @kroma/client/<domain>.`,
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
      await init;
      const [imports, exports] = parse(code, file);
      if (posix(file) === entry && !exports.some((e) => e.n === 'default')) {
        this.error(`${file}: the module entry must \`export default defineModule({ ... })\``);
      }
      const s = new MagicString(code);
      let count = 0;
      for (const imp of imports) {
        if (!imp.n) continue;
        const key = sharedKey(imp.n);
        if (!key) continue;
        const tmp = `__ks${count++}`;
        if (imp.d >= 0) {
          s.overwrite(imp.ss, imp.se, `Promise.resolve(${HELPER_FN}(${JSON.stringify(key)}))`);
          continue;
        }
        const statement = code.slice(imp.ss, imp.se);
        const rewritten = statement.startsWith('export')
          ? rewriteReexport(statement, key, tmp)
          : rewriteImport(statement, key, tmp);
        s.overwrite(imp.ss, imp.se, rewritten);
      }
      if (count === 0) return null;
      s.prepend(`import { ${HELPER_FN} } from ${JSON.stringify(HELPER)};\n`);
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
    generateBundle(_options, bundle) {
      if (!(REMOTE_STYLES in bundle)) return;
      const entry = bundle[REMOTE_ENTRY];
      if (entry?.type !== 'chunk') return;
      entry.code = `${LINK_STYLES}\n${entry.code}`;
    },
  };

  return [manifest, shared];
}
