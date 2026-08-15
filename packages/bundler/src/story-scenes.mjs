// The scenes of a `.story.mdx`, lifted out of the document at compile time.
//
// A `<Scene>` is written once, in the prose, the way a document is written: its
// take is a CHILD, not an attribute. A plain JSX child is a fixed composition;
// an `{(args) => ...}` expression child reads the live args, so the controls
// keep driving it; a scene with neither reuses the story's own render with its
// `args` merged in. The workbench also needs the scenes as DATA - a tab per
// scene, each with a render and the source it was written as - without mounting
// the document to find out. So this remark plugin splits each Scene's children
// into the take and the prose, moves the take onto the element as an
// `example`/`render` attribute the Scene component understands, and injects
// `export const __scenes = [...]` beside the document.
//
// Because this runs in the shared MDX options, Metro compiles it too - so a
// scene's source text reaches a television, which the `.stories.tsx` reader
// (story-code-read.ts, Vite-only) never could.
//
// Plain `.mjs` for the same reason as mdx.mjs beside it: Metro's transformer
// workers run under plain node and reach this file through `import()`.

import { Parser } from 'acorn';
import jsx from 'acorn-jsx';

const SUFFIX = '.story.mdx';

// A JSX child is re-read as an expression, because at this stage it is still
// markdown AST: the estree the injected export needs does not exist yet.
const parser = Parser.extend(jsx());

// The span as written, less the indentation the document's own nesting put
// there. The first line starts at the token, so only the rest carry it.
function dedent(text) {
  const [first, ...rest] = text.split('\n');
  const indents = rest
    .filter((line) => line.trim())
    .map((line) => line.length - line.trimStart().length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return [first, ...rest.map((line) => line.slice(cut))].join('\n').trimEnd();
}

const spanOf = (node, doc) => doc.slice(node.position.start.offset, node.position.end.offset);

const property = (name, value) => ({
  type: 'Property',
  kind: 'init',
  method: false,
  shorthand: false,
  computed: false,
  key: { type: 'Identifier', name },
  value,
});

const literal = (value) => ({ type: 'Literal', value });

const arrow = (body) => ({
  type: 'ArrowFunctionExpression',
  id: null,
  expression: true,
  generator: false,
  async: false,
  params: [],
  body,
});

// The attribute the Scene element ends up carrying, so the document draws the
// same take the canvas does without the author spelling it twice.
const attributeOf = (name, expression, code) => ({
  type: 'mdxJsxAttribute',
  name,
  value: {
    type: 'mdxJsxAttributeValueExpression',
    value: code,
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [{ type: 'ExpressionStatement', expression }],
      },
    },
  },
});

// One take: which prop it becomes, the expression behind it, and its source.
function takeOf(child, doc, fail) {
  if (child.type === 'mdxJsxFlowElement') {
    const code = dedent(spanOf(child, doc));
    let parsed;
    try {
      parsed = parser.parseExpressionAt(code, 0, { ecmaVersion: 'latest' });
    } catch {
      return fail(
        'a fixed take is one JSX element (markdown inside it has no meaning on the canvas)',
      );
    }
    return { name: 'example', expression: arrow(parsed), code };
  }
  const expression = child.data?.estree?.body[0]?.expression;
  if (expression?.type === 'ArrowFunctionExpression') {
    // One spelling, and it is the typed one: a bare arrow renders identically
    // but is handed no types, so an editor cannot say what `args` holds.
    return fail('wrap a live take in `story.take(...)`, which types its args');
  }
  const arrowOf = liveArrow(expression);
  if (arrowOf?.type !== 'ArrowFunctionExpression' || arrowOf.params.length === 0) {
    return fail('a live take is an arrow reading the args: {story.take((args) => ...)}');
  }
  return {
    name: 'render',
    expression: arrowOf,
    code: dedent(doc.slice(arrowOf.start, arrowOf.end).trim()),
  };
}

// The arrow inside `story.take(...)`, the one spelling of a live take. The
// helper is identity at runtime and exists so an editor can hand the arrow the
// story's own args.
function liveArrow(expression) {
  if (!expression) return undefined;
  const called =
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.property.name === 'take' &&
    expression.arguments.length === 1;
  return called ? expression.arguments[0] : undefined;
}

const isTake = (child) => child.type === 'mdxJsxFlowElement' || child.type === 'mdxFlowExpression';

function sceneObject(node, file) {
  const doc = String(file.value);
  const fail = (reason) => file.fail(`<Scene>: ${reason}`, node);

  const attributes = new Map();
  for (const attribute of node.attributes) {
    if (attribute.type !== 'mdxJsxAttribute') fail('a spread attribute has no scene to describe');
    attributes.set(attribute.name, attribute);
  }
  const name = attributes.get('name');
  if (typeof name?.value !== 'string') fail('every scene names itself: name="..."');
  for (const written of ['render', 'example']) {
    if (attributes.has(written)) fail(`the take is written as a child, not a \`${written}\` prop`);
  }

  const takes = node.children.filter(isTake);
  if (takes.length > 1) fail('one take per scene; compose two elements under one');
  const args = attributes.get('args');
  const take = takes[0] ? takeOf(takes[0], doc, fail) : undefined;
  if (take?.name === 'example' && args) {
    fail('a fixed take composes its own values, so `args` would move nothing');
  }

  const properties = [property('name', literal(name.value))];
  if (args) {
    const value = args.value;
    if (typeof value === 'string' || !value?.data?.estree) {
      fail('`args` takes an object in braces');
    }
    properties.push(property('args', value.data.estree.body[0].expression));
  }
  if (take) {
    properties.push(property(take.name, take.expression), property('code', literal(take.code)));
    node.attributes.push(attributeOf(take.name, take.expression, take.code));
    node.children = node.children.filter((child) => !isTake(child));
  }
  return { type: 'ObjectExpression', properties };
}

function scenesExport(elements) {
  return {
    type: 'mdxjsEsm',
    value: '',
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [
          {
            type: 'ExportNamedDeclaration',
            specifiers: [],
            source: null,
            declaration: {
              type: 'VariableDeclaration',
              kind: 'const',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: '__scenes' },
                  init: { type: 'ArrayExpression', elements },
                },
              ],
            },
          },
        ],
      },
    },
  };
}

function collect(node, found) {
  if (node.type === 'mdxJsxFlowElement' && node.name === 'Scene') found.push(node);
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) collect(child, found);
}

const GUIDED = new Set(['Do', 'Dont']);

const isGuidance = (node) => node.type === 'mdxJsxFlowElement' && GUIDED.has(node.name);

// A do and the don't it answers are written as two blocks, because that is how
// they read in a source file - one list of each. They BELONG side by side, so a
// run of them becomes one `<Guidance>` here rather than asking every document to
// wrap its own. Nothing an author writes changes; the pair simply arrives at the
// renderer as a pair.
function pairGuidance(tree) {
  const out = [];
  for (const node of tree.children) {
    const last = out.at(-1);
    if (isGuidance(node) && last?.type === 'mdxJsxFlowElement' && last.name === 'Guidance') {
      last.children.push(node);
      continue;
    }
    if (isGuidance(node)) {
      out.push({ type: 'mdxJsxFlowElement', name: 'Guidance', attributes: [], children: [node] });
      continue;
    }
    out.push(node);
  }
  tree.children = out;
}

const namedExport = (name, expression) => ({
  type: 'mdxjsEsm',
  value: '',
  data: {
    estree: {
      type: 'Program',
      sourceType: 'module',
      body: [
        {
          type: 'ExportNamedDeclaration',
          specifiers: [],
          source: null,
          declaration: {
            type: 'VariableDeclaration',
            kind: 'const',
            declarations: [
              { type: 'VariableDeclarator', id: { type: 'Identifier', name }, init: expression },
            ],
          },
        },
      ],
    },
  },
});

// A parameterless arrow is ceremony that binds nothing, so a reader gets its
// body; one that takes the args is kept whole, because the parameter is where
// the controls reach the JSX.
function shownRender(expression) {
  if (expression.type !== 'ArrowFunctionExpression' || expression.params.length > 0) {
    return expression;
  }
  return expression.body.type === 'BlockStatement' ? expression : expression.body;
}

// The source of the declaration's own `render`, for the code drawer: the story
// is `export const story = defineStory({ ... })` in one of the document's ESM
// blocks, whose estree carries document offsets.
// Past the export wrapper, to the declaration itself.
function declarationOf(statement) {
  const declared = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
  return declared?.type === 'VariableDeclaration' ? declared : null;
}

// `const story = ...`, and the object it is: handed to `defineStory` or written
// out on its own.
function definitionIn(declaration) {
  for (const declared of declaration.declarations) {
    if (declared.id.type !== 'Identifier' || declared.id.name !== 'story') continue;
    const init = declared.init;
    const definition = init?.type === 'CallExpression' ? init.arguments[0] : init;
    return definition?.type === 'ObjectExpression' ? definition : null;
  }
  return null;
}

function storyDefinition(body) {
  for (const statement of body) {
    const declaration = declarationOf(statement);
    if (declaration) return definitionIn(declaration);
  }
  return null;
}

function renderProperty(definition) {
  for (const entry of definition.properties) {
    if (entry.type !== 'Property' || entry.key.type !== 'Identifier') continue;
    if (entry.key.name === 'render') return entry.value;
  }
  return null;
}

function renderCode(tree, doc) {
  for (const node of tree.children) {
    if (node.type !== 'mdxjsEsm' || !node.data?.estree) continue;
    const definition = storyDefinition(node.data.estree.body);
    if (!definition) continue;
    const value = renderProperty(definition);
    if (!value) return undefined;
    const shown = shownRender(value);
    return dedent(doc.slice(shown.start, shown.end).trim());
  }
  return undefined;
}

/** Lifts every `<Scene>` of a `*.story.mdx` into `export const __scenes`, in
 * document order, each carrying its name, its `args`, the take written as its
 * child, and that take's source text; and the declaration's own `render`
 * source into `export const __code`. The element keeps the take as a
 * compiler-set prop and its prose as children. Any other file passes through
 * untouched. */
export function remarkStoryScenes() {
  return (tree, file) => {
    if (!String(file.path ?? '').endsWith(SUFFIX)) return;
    const doc = String(file.value);
    const found = [];
    collect(tree, found);
    if (found.length > 0) {
      tree.children.push(scenesExport(found.map((node) => sceneObject(node, file))));
    }
    const code = renderCode(tree, doc);
    if (code) tree.children.push(namedExport('__code', literal(code)));
    pairGuidance(tree);
  };
}
