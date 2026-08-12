// Prop documentation, read from the components at BUILD time.
//
// The workbench's Props tab shows every prop a component takes, its type and
// the JSDoc line explaining what it is for, read here against a real type
// checker rather than a regex over source text - which cannot follow
// `extends`, so a <Button> would document ten props and take eighteen.
//
// The checker is TypeScript 7's own, which is the version this repo already
// builds with - no second toolchain, and no react-docgen-typescript, whose
// classic-API requirement would have meant pinning TypeScript 5 beside it.
//
// The ASYNC half of that API, deliberately: the sync one reaches for
// `stdout._handle.fd` to run its RPC channel over a raw file descriptor, which
// is a Node internal Bun does not implement - and every build in this repo is
// run by Bun. A Vite plugin's `load` may return a promise, so nothing is lost.
//
// The one subtlety worth keeping: a prop's type is read from the AST as WRITTEN,
// not from `checker.typeToString`. The checker resolves an alias to its
// definition, which turns the honest `icon?: IconName` into a 6215-member union
// of every Tabler glyph, truncated by the compiler and useless to a reader. The
// declaration's own source text is what the author wrote and what a reader wants
// to see; the checker is used only to enumerate WHICH props exist, which is the
// part it is uniquely good at.

import type { Identifier, ObjectLiteralElementLike, Statement } from 'typescript/unstable/ast';
import {
  isIdentifier,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isVariableStatement,
} from 'typescript/unstable/ast/is';
import { API, SignatureKind } from 'typescript/unstable/async';

/** One documented prop, as the workbench's panel shows it. Mirrors
 * `PropDoc` in @kroma/workbench; kept structural rather than imported so this
 * build-time module has no runtime dependency on the package. */
export interface PropDoc {
  name: string;
  type: string;
  optional: boolean;
  docs?: string;
}

/** A component's props, keyed `Button` for a plain component and `Dialog.Root`
 * for one part of a compound one. The workbench looks a story's props up by the
 * story's own name, which is the component's name by convention, and reads a
 * compound one's parts off the keys under it - in this map's key order, which is
 * the order its namespace object declares them. */
export type PropDocs = Record<string, PropDoc[]>;

type Entry = [name: string, props: PropDoc[]];

// Props every React component has and nobody needs told about.
const NOISE = new Set(['key']);

/**
 * Whether a prop DECLARED in this file is the component's own API.
 *
 * A kit component reaches react-native's whole surface by extending it -
 * `ViewProps`, `PressableProps`, `TextProps` - and those props belong to the
 * platform, not to the component: a panel that opens on `onPointerEnterCapture`
 * documents nothing. So a prop counts only when the declaration the checker
 * found for it is one of ours. Re-declaring an inherited prop (<TextField>'s
 * `autoComplete`) writes that declaration in a file of ours, which is exactly
 * why a re-declared prop comes back.
 */
export function ownDeclaration(path: string): boolean {
  return !path.includes('/node_modules/');
}

// The JSDoc block immediately above a member, as one paragraph. `@tag` lines are dropped: they
// document the author's intent, not the prop.
function docsFrom(memberText: string): string {
  const block = /^\s*\/\*\*((?:(?!\*\/)[\s\S])*)\*\//.exec(memberText);
  if (!block?.[1]) return '';
  return block[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*?/, '').trim())
    .filter((line) => line && !line.startsWith('@'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A declaring file's text, memoised by the caller. An inherited prop is declared in the file
// its own interface lives in, so this is keyed by the DECLARATION's path rather than the
// component's.
type TextOf = (path: string) => Promise<string>;

type Snapshot = Awaited<ReturnType<API['updateSnapshot']>>;
type Project = NonNullable<ReturnType<Snapshot['getProject']>>;
type Checker = Project['checker'];
type PropSymbol = Awaited<ReturnType<Checker['getPropertiesOfType']>>[number];
type Type = Parameters<Checker['getPropertiesOfType']>[0];

// One property, as the panel shows it - or null when it is noise, or has no declaration to read
// a written type and a doc comment out of.
async function propDocOf(symbol: PropSymbol, textOf: TextOf): Promise<PropDoc | null> {
  if (NOISE.has(symbol.name)) return null;
  // A re-declared prop carries both declarations; ours is the one to read.
  const handle = symbol.declarations?.find((declaration) => ownDeclaration(declaration.path));
  const node = (await handle?.resolve()) as
    | { pos: number; end: number; type?: { pos: number; end: number } }
    | undefined;
  if (!handle || !node) return null;
  const source = await textOf(handle.path);
  // `pos` starts at the end of the previous token, so this span carries the
  // member's leading trivia - which is where its JSDoc is.
  const member = source.slice(node.pos, node.end);
  const written = node.type ? source.slice(node.type.pos, node.type.end).trim() : 'unknown';
  const docs = docsFrom(member);
  return {
    name: symbol.name,
    type: written,
    // Read off the declaration text: TS 7's node proxies do not surface
    // `questionToken`, and `name?:` is unambiguous in a member.
    optional: new RegExp(String.raw`\b${symbol.name}\s*\?\s*:`).test(member),
    ...(docs ? { docs } : null),
  };
}

async function propsOfType(type: Type, checker: Checker, textOf: TextOf): Promise<PropDoc[]> {
  // Every prop in flight at once: the checker is an RPC channel, and awaiting
  // one round-trip per prop is what made this plugin show up in build timings.
  const symbols = await checker.getPropertiesOfType(type);
  const docs = await Promise.all(symbols.map((symbol) => propDocOf(symbol, textOf)));
  return docs.filter((doc): doc is PropDoc => doc !== null);
}

// `interface FooProps { ... }` -> `Foo` and its documented props. Empty for any other statement,
// for a `*Props` that turns out to document nothing, and for one a namespace already claims.
async function componentEntries(
  statement: Statement,
  checker: Checker,
  textOf: TextOf,
  claimed: ReadonlySet<string>,
): Promise<Entry[]> {
  const declared = (statement as { name?: { text?: string } }).name?.text;
  if (!declared?.endsWith('Props')) return [];
  const component = declared.slice(0, -'Props'.length);
  if (!component || claimed.has(component)) return [];
  const type = await checker.getTypeAtLocation((statement as { name?: unknown }).name as never);
  if (!type) return [];
  const props = await propsOfType(type, checker, textOf);
  return props.length ? [[component, props]] : [];
}

interface Part {
  name: string;
  value: Identifier;
}

interface Namespace {
  name: string;
  parts: Part[];
}

/** A compound component's name and the names of its parts. `Namespace` is one;
 * the rule below takes the shape rather than the AST so it can be read - and
 * tested - without a checker. */
interface NamespaceShape {
  name: string;
  parts: readonly { name: string }[];
}

const capitalised = (name: string): boolean => /^[A-Z]/.test(name);

// `Root` and `Group: ListGroup` both name a part; anything else in the object
// says this is not a namespace.
function partOf(property: ObjectLiteralElementLike): Part | null {
  const shorthand = isShorthandPropertyAssignment(property);
  if (!shorthand && !isPropertyAssignment(property)) return null;
  const name = property.name;
  if (!isIdentifier(name) || !capitalised(name.text)) return null;
  if (shorthand) return { name: name.text, value: name };
  return isIdentifier(property.initializer)
    ? { name: name.text, value: property.initializer }
    : null;
}

// `const Dialog = { Root, Header, … }` - the parts of a compound component, in
// the order the namespace declares them. Null for anything else, including the
// object literals that are lookup tables rather than components.
function namespaceOf(statement: Statement): Namespace | null {
  if (!isVariableStatement(statement)) return null;
  const { declarations } = statement.declarationList;
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const name = declaration?.name;
  if (!name || !isIdentifier(name) || !capitalised(name.text)) return null;
  const initializer = declaration?.initializer;
  if (!initializer || !isObjectLiteralExpression(initializer)) return null;
  const parts = initializer.properties.map(partOf);
  if (!parts.length || parts.includes(null)) return null;
  return { name: name.text, parts: parts as Part[] };
}

// The parameter the part's component takes, whatever the interface behind it is
// called: `ListRow.Group` is a <ListGroup>, which no rule over names could find.
async function partProps(part: Part, checker: Checker, textOf: TextOf): Promise<PropDoc[]> {
  const type = await checker.getTypeAtLocation(part.value);
  if (!type) return [];
  const [signature] = await checker.getSignaturesOfType(type, SignatureKind.Call);
  if (!signature) return [];
  const parameter = await checker.getParameterType(signature, 0);
  return parameter ? propsOfType(parameter, checker, textOf) : [];
}

async function namespaceEntries(
  namespace: Namespace,
  checker: Checker,
  textOf: TextOf,
): Promise<Entry[]> {
  const props = await Promise.all(namespace.parts.map((part) => partProps(part, checker, textOf)));
  return namespace.parts.flatMap((part, at) => {
    const documented = props[at] ?? [];
    return documented.length ? [[`${namespace.name}.${part.name}`, documented] as Entry] : [];
  });
}

/**
 * The flat names a compound component's parts already document.
 *
 * `Field = { Root }` renders a function whose props are `FieldRootProps`, so the
 * interface scan emits a `FieldRoot` entry beside the `Field.Root` one - the
 * same component twice, and the panel only ever reads the part. Named after this
 * kit's own convention, `<Namespace><Part>Props`, so a part whose component has
 * a name of its own (`ListRow.Group` is a `<ListGroup>`) keeps its flat entry
 * rather than risking a standalone component being dropped for sharing a name.
 */
export function claimedByParts(namespaces: readonly NamespaceShape[]): Set<string> {
  const names = new Set<string>();
  for (const namespace of namespaces) {
    for (const part of namespace.parts) names.add(`${namespace.name}${part.name}`);
  }
  return names;
}

/**
 * Read the props of every `interface <Name>Props` in the given project, and of
 * every part of a compound component's namespace object.
 *
 * `tsconfig` is the project whose program the components live in;
 * `include` decides which of its files are scanned (the design system's
 * components, not its tests or its stories).
 */
export async function readPropDocs(
  tsconfig: string,
  include: (fileName: string) => boolean,
): Promise<PropDocs> {
  const api = new API({ cwd: process.cwd() });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [tsconfig] });
    const project = snapshot.getProject(tsconfig) ?? snapshot.getProjects()[0];
    if (!project) throw new Error(`props-docs: could not open ${tsconfig}`);
    const { program, checker } = project;

    // Each declaring file's text, fetched once. An inherited prop is declared in
    // the file its interface lives in, not in the component's, so this is keyed
    // by the DECLARATION's path rather than by the component's. The map holds
    // PROMISES so concurrent lookups of one path share a single fetch.
    const texts = new Map<string, Promise<string>>();
    const textOf: TextOf = (path) => {
      let hit = texts.get(path);
      if (!hit) {
        hit = program.getSourceFile(path).then((file) => file?.text ?? '');
        texts.set(path, hit);
      }
      return hit;
    };

    // Everything in flight at once: the checker is an RPC channel, so the cost
    // model is round-trips, not work.
    const names = (await program.getSourceFileNames()).filter(include);
    const files = await Promise.all(names.map((name) => program.getSourceFile(name)));
    const statements = files.flatMap((file) => file?.statements ?? []);
    // The namespaces first, because what they claim decides which flat entries
    // are duplicates of a part.
    const namespaces = statements
      .map(namespaceOf)
      .filter((namespace): namespace is Namespace => namespace !== null);
    const claimed = claimedByParts(namespaces);
    const found = await Promise.all([
      ...namespaces.map((namespace) => namespaceEntries(namespace, checker, textOf)),
      ...statements.map((statement) => componentEntries(statement, checker, textOf, claimed)),
    ]);

    const out: PropDocs = {};
    for (const [name, props] of found.flat()) out[name] = props;
    return out;
  } finally {
    api.close();
  }
}
