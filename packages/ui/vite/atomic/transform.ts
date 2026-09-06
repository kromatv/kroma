// The rewrite: a module's static style declarations become the compiled leaves
// the runtime registers, and the rules those leaves need are handed back for
// the sheet. A leaf the evaluator cannot read stays as written and resolves at
// runtime, so a module is never rejected, only left partly compiled.

import MagicString from 'magic-string';
import type { RuleEntry } from '#ui/core/atomic';
import type { CompiledRule } from './compile.ts';
import { type CompiledLeaf, compileDeclaration } from './declaration.ts';
import { evaluate } from './evaluate.ts';
import {
  type ModuleLoader,
  type ModuleScope,
  type Node,
  parseModule,
  scopeOf,
  Unstatic,
} from './module-scope.ts';
import { properties, type RecipeLayers, recipeLayers, styleSlotsOf } from './recipe-shape.ts';

const KIT_SOURCES = new Set([
  '#ui/core',
  '#ui/core/styles',
  '#ui/core/recipe',
  '@kroma/ui/kit',
  '@kroma/ui',
]);

const RUNTIME = '#ui/core/atomic';

const HELPER = '__kromaStatic';

const INJECT = '__kromaInject';

type Api = 'styles' | 'style' | 'sv' | 'svFor';

const APIS: ReadonlySet<string> = new Set<Api>(['styles', 'style', 'sv', 'svFor']);

const PREFILTER = /\b(styles|style|sv)\s*\(|\bsvFor\b/;

export interface Skip {
  readonly line: number;
  readonly reason: string;
}

export interface TransformResult {
  /** Null when nothing compiled: the module is left as written, and `skipped` says why. */
  readonly code: string | null;
  readonly map: ReturnType<MagicString['generateMap']> | null;
  readonly rules: readonly CompiledRule[];
  readonly compiled: number;
  readonly skipped: readonly Skip[];
}

export interface TransformInput {
  code: string;
  file: string;
  loader: ModuleLoader;
  /** Inject the rules at module load, for a dev server that writes no sheet. */
  inject: boolean;
}

function kitBindings(scope: ModuleScope): Map<string, Api> {
  const out = new Map<string, Api>();
  for (const [local, { source, imported }] of scope.imports) {
    if (KIT_SOURCES.has(source) && APIS.has(imported)) out.set(local, imported as Api);
  }
  return out;
}

const json = (value: unknown) => JSON.stringify(value);

function leafCode(leaf: CompiledLeaf): string {
  const states = leaf.states
    ? `,{${Object.entries(leaf.states)
        .map(([name, coat]) => `${name}:${HELPER}(${json(coat)})`)
        .join(',')}}`
    : '';
  return `${HELPER}(${json(leaf.values)}${states})`;
}

interface Edit {
  node: Node;
  leaf: CompiledLeaf;
}

class Rewrite {
  readonly edits: Edit[] = [];
  readonly skipped: Skip[] = [];
  private readonly code: string;
  private readonly scope: ModuleScope;
  private readonly loader: ModuleLoader;

  constructor(code: string, scope: ModuleScope, loader: ModuleLoader) {
    this.code = code;
    this.scope = scope;
    this.loader = loader;
  }

  skip(node: Node, reason: string): void {
    let line = 1;
    for (let i = 0; i < node.start; i++) if (this.code.codePointAt(i) === 10) line++;
    this.skipped.push({ line, reason });
  }

  /** Compiles one declaration node, or records why it could not be. */
  leaf(node: Node): CompiledLeaf | null {
    try {
      const value = evaluate(node, this.scope, this.loader);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Unstatic('a declaration that is not an object');
      }
      return compileDeclaration(value as Record<string, unknown>);
    } catch (error) {
      if (!(error instanceof Unstatic)) throw error;
      this.skip(node, error.reason);
      return null;
    }
  }

  single(node: Node): void {
    const leaf = this.leaf(node);
    if (leaf) this.edits.push({ node, leaf });
  }

  /** Each entry of a `styles({...})` set on its own: one that fails stays. */
  set(object: Node): void {
    for (const [, value] of properties(object)) this.single(value);
  }

  /** A recipe compiles whole per slot, or not at all: its layers merge as
   *  classes or as longhands, never both. */
  recipe(config: Node, styled: (slots: readonly string[]) => Set<string>): void {
    const shape = recipeLayers(config);
    if (typeof shape === 'string') {
      this.skip(config, shape);
      return;
    }
    const slots = slotNodes(shape, styled(shape.slots));
    if (!Array.isArray(slots)) {
      this.skip(slots, 'a layer not written inline');
      return;
    }
    const edits: Edit[] = [];
    for (const node of slots) {
      const leaf = this.leaf(node);
      if (!leaf) return;
      edits.push({ node, leaf });
    }
    this.edits.push(...edits);
  }
}

function slotNodes(shape: RecipeLayers, compiledSlots: Set<string>): Node[] | Node {
  const nodes: Node[] = [];
  for (const layer of shape.layers) {
    if (shape.flat) {
      if (compiledSlots.has('root')) nodes.push(layer);
      continue;
    }
    if (layer.type !== 'ObjectExpression') return layer;
    for (const [slot, node] of properties(layer)) {
      if (compiledSlots.has(slot)) nodes.push(node);
    }
  }
  return nodes;
}

function walk(node: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const record = node as Node;
  if (typeof record.type === 'string') visit(record);
  for (const key of Object.keys(record)) {
    if (key !== 'type' && key !== 'start' && key !== 'end') walk(record[key], visit);
  }
}

function visitCall(node: Node, bindings: Map<string, Api>, rewrite: Rewrite): void {
  const callee = node.callee as Node;
  const args = node.arguments as Node[];
  const argument = args[0];
  if (!argument || args.length !== 1) return;
  if (callee.type === 'Identifier') {
    const api = bindings.get(callee.name as string);
    if (api === 'styles' && argument.type === 'ObjectExpression') rewrite.set(argument);
    else if (api === 'style') rewrite.single(argument);
    else if (api === 'sv') rewrite.recipe(argument, (slots) => new Set(slots));
    return;
  }
  if (callee.type !== 'CallExpression') return;
  const inner = callee.callee as Node;
  if (inner.type !== 'Identifier' || bindings.get(inner.name as string) !== 'svFor') return;
  const styled = styleSlotsOf(callee.typeArguments as Node | null | undefined);
  if (styled) rewrite.recipe(argument, () => styled);
  else rewrite.skip(node, 'svFor without an inline slot type');
}

function header(inject: boolean, rules: readonly CompiledRule[]): string {
  const names = [`staticStyle as ${HELPER}`, ...(inject ? [`injectRules as ${INJECT}`] : [])];
  let out = `import { ${names.join(', ')} } from '${RUNTIME}';`;
  if (inject) {
    const entries: RuleEntry[] = [...new Map(rules.map((rule) => [rule.css, rule.group]))].map(
      ([css, group]) => [group, css],
    );
    out += `${INJECT}(${json(entries)});`;
  }
  return `${out}\n`;
}

/** Rewrites `code`, or returns null when it declares nothing to compile. */
export function transformModule({
  code,
  file,
  loader,
  inject,
}: TransformInput): TransformResult | null {
  if (!PREFILTER.test(code)) return null;
  const program = parseModule(code, file);
  const scope = scopeOf(program, file);
  const bindings = kitBindings(scope);
  if (bindings.size === 0) return null;
  const rewrite = new Rewrite(code, scope, loader);
  walk(program.body, (node) => {
    if (node.type === 'CallExpression') visitCall(node, bindings, rewrite);
  });
  if (rewrite.edits.length === 0) {
    if (rewrite.skipped.length === 0) return null;
    return { code: null, map: null, rules: [], compiled: 0, skipped: rewrite.skipped };
  }

  const s = new MagicString(code);
  const rules: CompiledRule[] = [];
  for (const { node, leaf } of rewrite.edits) {
    s.overwrite(node.start, node.end, leafCode(leaf));
    rules.push(...leaf.rules);
  }
  s.prepend(header(inject, rules));
  return {
    code: s.toString(),
    map: s.generateMap({ hires: true, source: file, includeContent: false }),
    rules,
    compiled: rewrite.edits.length,
    skipped: rewrite.skipped,
  };
}
