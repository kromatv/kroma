// A story's own source, cut out of the story file at BUILD time.
//
// The workbench's code drawer shows a demo's real file text and, beside a scene,
// showed nothing at all: a compiled render's `toString()` gives the
// post-transform `jsx(...)` calls, which is not what anybody wrote. So the
// authored spans are read here and shipped as data - the same bargain as
// props-read.ts, against the same parser, for the same reason a regex cannot do
// it (JSX text carries apostrophes, slashes and braces of its own).
//
// The ASYNC half of TypeScript's API, deliberately: the sync one runs its RPC
// channel over `stdout._handle.fd`, a Node internal Bun does not implement, and
// every build here is run by Bun.

import { relative, sep } from 'node:path';
import type {
  Expression,
  Node,
  ObjectLiteralExpression,
  SourceFile,
} from 'typescript/unstable/ast';
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isBlock,
  isCallExpression,
  isExportAssignment,
  isIdentifier,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
} from 'typescript/unstable/ast/is';
import { API } from 'typescript/unstable/async';

/** One story file's authored source: the story's own `render`, and one entry
 *  per scene in the order the file declares them. Mirrors `StoryCode` in
 *  @kroma/workbench; kept structural rather than imported so this build-time
 *  module has no runtime dependency on the package. */
export interface StoryCode {
  render?: string;
  scenes: string[];
}

/** Every story file's source, keyed by repository-relative path - the one
 *  spelling both bundlers' globs can be reduced to. */
export type StoryCodes = Record<string, StoryCode>;

/** Where the stories are read from: `tsconfig` is the project whose program
 *  they live in, `repo` the checkout the keys are relative to, and `include`
 *  which of the project's files are stories. */
export interface StoryCodeSources {
  tsconfig: string;
  repo: string;
  include: (fileName: string) => boolean;
}

// The span as written, less the indentation the story file's own nesting put
// there. The first line starts at the token, so only the rest carry it.
function dedent(text: string): string {
  const [first, ...rest] = text.split('\n');
  const indents = rest
    .filter((line) => line.trim())
    .map((line) => line.length - line.trimStart().length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return [first as string, ...rest.map((line) => line.slice(cut))].join('\n').trimEnd();
}

// A parameterless arrow is the story format's own ceremony - it binds nothing -
// so what a reader wants is its body. One that takes the args is kept whole,
// because the parameter is where the controls reach the JSX, and a body shown
// without it reads as code with free variables in it.
function authored(node: Expression): Node {
  if (!isArrowFunction(node) || node.parameters.length > 0) return node;
  const body = node.body;
  if (isBlock(body)) return node;
  return isParenthesizedExpression(body) ? body.expression : body;
}

function displayed(node: Expression, text: string): string {
  const shown = authored(node);
  // `pos` starts at the end of the previous token, so the span opens on the
  // whitespace after the `:` or the `(`.
  return dedent(text.slice(shown.pos, shown.end).trim());
}

function propertyOf(object: ObjectLiteralExpression, name: string): Expression | undefined {
  for (const property of object.properties) {
    if (!isPropertyAssignment(property)) continue;
    if (isIdentifier(property.name) && property.name.text === name) return property.initializer;
  }
  return undefined;
}

// A scene declares `example`, or `render`, or neither - and neither reuses the
// story's own render, which is then what its source is.
function scenesOf(story: ObjectLiteralExpression, text: string, own: string): string[] {
  const scenes = propertyOf(story, 'scenes');
  if (!scenes || !isArrayLiteralExpression(scenes)) return [];
  return scenes.elements.map((element) => {
    if (!isObjectLiteralExpression(element)) return '';
    const written = propertyOf(element, 'example') ?? propertyOf(element, 'render');
    return written ? displayed(written, text) : own;
  });
}

// `export default story({ … })`, which is the one shape a story file has.
function storyObject(file: SourceFile): ObjectLiteralExpression | undefined {
  for (const statement of file.statements) {
    if (!isExportAssignment(statement)) continue;
    const call = statement.expression;
    if (!isCallExpression(call)) continue;
    const [argument] = call.arguments;
    if (argument && isObjectLiteralExpression(argument)) return argument;
  }
  return undefined;
}

// A story naming a `component` rather than writing a `render` has no authored
// JSX to show, and neither has an empty file: both are left out, so the drawer
// falls back to the call site the controls describe.
function codeOf(file: SourceFile): StoryCode | null {
  const object = storyObject(file);
  if (!object) return null;
  const render = propertyOf(object, 'render');
  const own = render ? displayed(render, file.text) : '';
  const scenes = scenesOf(object, file.text, own);
  if (!own && scenes.every((scene) => !scene)) return null;
  return { ...(own ? { render: own } : null), scenes };
}

const keyOf = (repo: string, fileName: string): string =>
  relative(repo, fileName).split(sep).join('/');

/**
 * Read every story's own `render` and the source of each of its scenes.
 *
 * Syntax only - the program is opened for its parser, never its checker - so
 * the cost is one program and a walk of the story files' statements.
 */
export async function readStoryCode({
  tsconfig,
  repo,
  include,
}: StoryCodeSources): Promise<StoryCodes> {
  const api = new API({ cwd: process.cwd() });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [tsconfig] });
    const project = snapshot.getProject(tsconfig) ?? snapshot.getProjects()[0];
    if (!project) throw new Error(`story-code: could not open ${tsconfig}`);
    const { program } = project;
    const names = (await program.getSourceFileNames()).filter(include);
    const found = await Promise.all(names.map((name) => program.getSourceFile(name)));
    const out: StoryCodes = {};
    for (const file of found.filter((one) => one !== undefined)) {
      const code = codeOf(file);
      if (code) out[keyOf(repo, file.fileName)] = code;
    }
    return out;
  } finally {
    api.close();
  }
}
