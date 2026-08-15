// A story's identity, read out of its `.story.mdx` at BUILD time.
//
// The workbench's lazy index lists every component before executing any of
// them, and a story names itself inside `defineStory({ ... })`, in an ESM block
// the TypeScript project never sees. The two literals the index needs are read
// off the compiled module with acorn (the compile has already turned the JSX
// into calls), and a file that cannot be read ships nothing rather than failing
// the build - which is also what every Metro build sees.

import { relative, sep } from 'node:path';

/** What the build knows about one story file: the `name` and `group` a
 *  workbench needs to LIST it without running the module that draws it. Mirrors
 *  `StoryCode` in @kroma/workbench; kept structural rather than imported so
 *  this build-time module has no runtime dependency on the package. */
export interface StoryCode {
  name?: string;
  group?: string;
}

/** Every story file's identity, keyed by repository-relative path - the one
 *  spelling both bundlers' globs can be reduced to. */
export type StoryCodes = Record<string, StoryCode>;

const keyOf = (repo: string, fileName: string): string =>
  relative(repo, fileName).split(sep).join('/');

type Node = { type: string; [key: string]: unknown };

// Past the export wrapper, to the declaration itself.
function declarationOf(statement: Node): Node | null {
  const declared = (
    statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  ) as Node | null;
  return declared?.type === 'VariableDeclaration' ? declared : null;
}

// `const story = ...`, and the object it is: handed to `defineStory` or written
// out on its own.
function definitionIn(declaration: Node): Node | null {
  for (const declared of declaration.declarations as Node[]) {
    const id = declared.id as Node;
    if (id.type !== 'Identifier' || id.name !== 'story') continue;
    const init = declared.init as Node | null;
    const object = (init?.type === 'CallExpression' ? (init.arguments as Node[])[0] : init) as
      | Node
      | undefined;
    return object?.type === 'ObjectExpression' ? object : null;
  }
  return null;
}

function storyObject(program: { body: readonly Node[] }): Node | null {
  for (const statement of program.body) {
    const declaration = declarationOf(statement);
    if (declaration) return definitionIn(declaration);
  }
  return null;
}

/** A string property of the story object, read literally: anything computed is
 * a value the index cannot know without running the module. */
function wordOf(definition: Node, name: string): string | undefined {
  for (const entry of definition.properties as Node[]) {
    if (entry.type !== 'Property' || entry.computed) continue;
    const key = entry.key as Node;
    const value = entry.value as Node;
    if (key.type !== 'Identifier' || key.name !== name) continue;
    if (value.type === 'Literal' && typeof value.value === 'string') return value.value;
  }
  return undefined;
}

async function parseModule(fileName: string): Promise<{ body: readonly Node[] } | null> {
  const [{ readFile }, { compileMdx }, { Parser }] = await Promise.all([
    import('node:fs/promises'),
    import('./mdx.mjs'),
    import('acorn'),
  ]);
  const text = await readFile(fileName, 'utf8').catch(() => null);
  if (text === null) return null;
  try {
    const compiled = await compileMdx(text, fileName);
    return Parser.parse(compiled, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    }) as unknown as { body: readonly Node[] };
  } catch {
    return null;
  }
}

async function mdxIdentity(fileName: string): Promise<StoryCode | null> {
  const program = await parseModule(fileName);
  const definition = program && storyObject(program);
  if (!definition) return null;
  const name = wordOf(definition, 'name');
  const group = wordOf(definition, 'group');
  if (!name && !group) return null;
  return { ...(name ? { name } : null), ...(group ? { group } : null) };
}

/** What every `.story.mdx` declares about itself - the `name` and `group` an
 * index lists it by - keyed by repository-relative path. */
export async function readStoryMdxCode(
  repo: string,
  files: readonly string[],
): Promise<StoryCodes> {
  const out: StoryCodes = {};
  const read = await Promise.all(files.map(mdxIdentity));
  for (const [at, code] of read.entries()) {
    const file = files[at];
    if (code && file) out[keyOf(repo, file)] = code;
  }
  return out;
}
