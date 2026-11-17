import { readFileSync } from 'node:fs';
import { defineRule } from '../define-rule.mjs';

const PALETTE = new URL('../../../ui/src/core/tokens/colors.ts', import.meta.url);
const RAW_SOURCES =
  /^(?:react-native|react-native-svg|react-native-web|#ui\/lib\/svg(?:\.component)?)$/;
const COLOUR_ATTRIBUTE = /^(?:color|fill|stroke|bgcolor)$|Color$|-color$/;
const COLOUR_KEY =
  /^(?:color|background|fill|stroke|boxShadow|textShadow)$|Color$|^(?:border|outline)(?:Top|Right|Bottom|Left|Block|Inline)?(?:Start|End)?$/;
const CANVAS_PAINT = new Set(['fillStyle', 'strokeStyle', 'shadowColor']);
const TOKEN_WORD = /^([A-Za-z][A-Za-z0-9]*)(\/\d+(?:\.\d+)?)?$/;
const CSS_KEYWORDS = new Set(['text']);
const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ParenthesizedExpression',
  'JSXExpressionContainer',
]);
const palette = { names: null };

/** Reads the kit's colour token names from the palette's source of truth. */
export function paletteNames(source = readFileSync(PALETTE, 'utf8')) {
  const block = /export const colors = \{([\s\S]*?)\n\} as const;/.exec(source)?.[1] ?? '';
  const names = [...block.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
  if (!names.length) {
    throw new Error(`no-unresolved-color-tokens: no colour token found in ${PALETTE.pathname}`);
  }
  return new Set(names);
}

function kitNames() {
  palette.names ??= paletteNames();
  return palette.names;
}

function camel(property) {
  return property.replaceAll(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function keyName(property) {
  if (property.computed) {
    return property.key.type === 'Literal' ? String(property.key.value) : '';
  }
  return property.key.name ?? String(property.key.value);
}

function unwrap(node) {
  let inner = node;
  while (inner && WRAPPERS.has(inner.type)) {
    inner = inner.expression;
  }
  return inner;
}

function branches(node) {
  if (node.type === 'ConditionalExpression') {
    return [node.consequent, node.alternate];
  }
  return node.type === 'LogicalExpression' ? [node.left, node.right] : [];
}

function splitWords(text) {
  return text
    .replaceAll(/url\([^)]*\)/g, ' ')
    .split(/[\s,()]+/)
    .filter(Boolean);
}

function quasiWords(quasi, index, last) {
  const text = quasi.value.cooked ?? '';
  const openStart = index > 0 && !/^[\s,()]/.test(text);
  const openEnd = index < last && !/[\s,()]$/.test(text);
  return splitWords(text).slice(openStart ? 1 : 0, openEnd ? -1 : undefined);
}

function wordsOf(node) {
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? splitWords(node.value) : [];
  }
  if (node.type !== 'TemplateLiteral') {
    return [];
  }
  const last = node.quasis.length - 1;
  return node.quasis.flatMap((quasi, index) => quasiWords(quasi, index, last));
}

function isWhole(node, words) {
  return words.length === 1 && !(node.type === 'TemplateLiteral' && node.expressions.length);
}

function tokenOf(word, whole) {
  const match = TOKEN_WORD.exec(word);
  if (!match || !kitNames().has(match[1])) {
    return undefined;
  }
  return whole || match[2] || !CSS_KEYWORDS.has(match[1]) ? word : undefined;
}

function lookup(context, identifier) {
  let scope = context.sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      return variable.defs[0];
    }
    scope = scope.upper;
  }
  return undefined;
}

function constInit(context, identifier) {
  const definition = lookup(context, identifier);
  return definition?.parent?.kind === 'const' ? definition.node.init : undefined;
}

function isRawElement(context, opening) {
  let root = opening.name;
  while (root.type === 'JSXMemberExpression') {
    root = root.object;
  }
  if (root.type !== 'JSXIdentifier' || (root === opening.name && /^[a-z]/.test(root.name))) {
    return true;
  }
  const definition = lookup(context, root);
  return definition?.type === 'ImportBinding' && RAW_SOURCES.test(definition.parent.source.value);
}

function isStyleOf(member) {
  return (
    member?.type === 'MemberExpression' && !member.computed && member.property.name === 'style'
  );
}

function report(scan, node, token) {
  const key = `${node.start}:${token}`;
  if (!scan.reported.has(key)) {
    scan.reported.add(key);
    scan.context.report({ node, messageId: 'unresolved', data: { token } });
  }
}

function checkValue(scan, node) {
  const value = unwrap(node);
  if (!value) {
    return;
  }
  for (const branch of branches(value)) {
    checkValue(scan, branch);
  }
  const words = wordsOf(value);
  const whole = isWhole(value, words);
  for (const token of words.map((word) => tokenOf(word, whole)).filter(Boolean)) {
    report(scan, value, token);
  }
}

function checkProperty(scan, property, walk) {
  if (property.type === 'SpreadElement') {
    checkStyle(scan, property.argument, walk);
  } else if (COLOUR_KEY.test(camel(keyName(property)))) {
    checkValue(scan, property.value);
  } else if (walk.deep) {
    checkStyle(scan, property.value, walk);
  }
}

function childrenOf(scan, value) {
  if (value.type === 'ObjectExpression') {
    return value.properties;
  }
  if (value.type === 'ArrayExpression') {
    return value.elements.filter(Boolean);
  }
  return value.type === 'Identifier' ? [constInit(scan.context, value)] : branches(value);
}

function checkStyle(scan, node, walk) {
  const value = unwrap(node);
  if (!value || walk.seen.has(value)) {
    return;
  }
  walk.seen.add(value);
  for (const child of childrenOf(scan, value)) {
    if (child?.type === 'Property' || child?.type === 'SpreadElement') {
      checkProperty(scan, child, walk);
    } else {
      checkStyle(scan, child, walk);
    }
  }
}

function typedCss(scan, annotation) {
  return (
    Boolean(annotation) && /\bCSSProperties\b/.test(scan.context.sourceCode.getText(annotation))
  );
}

function checkStyleRoot(scan, node, deep) {
  checkStyle(scan, node, { seen: new Set(), deep });
}

function elementVisitors(scan) {
  return {
    JSXAttribute(node) {
      const name = node.name.type === 'JSXIdentifier' ? node.name.name : '';
      if (!node.value || !name || !isRawElement(scan.context, node.parent)) {
        return;
      }
      if (name === 'style') {
        checkStyleRoot(scan, node.value, false);
      } else if (COLOUR_ATTRIBUTE.test(name)) {
        checkValue(scan, node.value);
      }
    },
  };
}

function typedVisitors(scan) {
  const typed = (node) => {
    if (typedCss(scan, node.typeAnnotation)) {
      checkStyleRoot(scan, node.expression, true);
    }
  };
  return {
    VariableDeclarator(node) {
      if (node.init && typedCss(scan, node.id.typeAnnotation)) {
        checkStyleRoot(scan, node.init, true);
      }
    },
    TSAsExpression: typed,
    TSSatisfiesExpression: typed,
  };
}

function setsStyle(callee) {
  return (
    callee.type === 'MemberExpression' &&
    callee.property.name === 'setProperty' &&
    isStyleOf(callee.object)
  );
}

function scriptVisitors(scan) {
  return {
    AssignmentExpression(node) {
      const target = node.left;
      const name =
        target.type === 'MemberExpression' && !target.computed ? target.property.name : '';
      if (CANVAS_PAINT.has(name) || (isStyleOf(target.object) && COLOUR_KEY.test(name))) {
        checkValue(scan, node.right);
      }
    },
    CallExpression(node) {
      const [property, value] = node.arguments;
      if (setsStyle(node.callee) && property?.type === 'Literal' && value) {
        if (COLOUR_KEY.test(camel(String(property.value)))) {
          checkValue(scan, value);
        }
      }
    },
  };
}

export default defineRule(
  'no-unresolved-color-tokens',
  {
    description: 'Resolve a kit colour token before it reaches a value the kit does not resolve.',
    why: "A token name such as 'accent' or 'text/52' means something only to the kit: styles(), sv(), sharedStyle(), a kit component's colour prop and color() resolve it. A DOM element's style or attribute, an SVG primitive, a React Native primitive's style and a canvas paint take it verbatim, so the browser rejects it as an invalid value and paints nothing.",
    scope:
      'Kit palette names, with or without a /NN alpha, written as a string or a static template in: the style or a colour attribute of a DOM element, an SVG primitive (#ui/lib/svg, react-native-svg) or a React Native primitive; an object typed CSSProperties; a canvas fillStyle, strokeStyle or shadowColor; an element.style colour property or setProperty call. A style object behind a const identifier or spread is followed within the file.',
    repair:
      "Resolve the name with color() from '#ui/core/color' (`color('accent')`, `color('text/52')`), passing the active theme where the element follows it, or move the declaration into styles() or onto a kit component's colour prop. Never retype the hex: a palette change has to reach the element, and on a browser color() answers the custom property the theme repaints.",
    exceptions:
      "Kit declarations and kit component props are the resolver's own input and stay as they are. A palette name that is also a CSS keyword ('text') is reported only as a whole value or with an alpha. Values computed at runtime are not followed.",
    verification:
      'Run bun run lint and the focused component tests; on a browser, read the element style in the inspector and check the colour is a real value.',
    invalid: ["const node = <div style={{ background: 'bg' }} />;"],
    valid: ["const node = <div style={{ background: color('bg') }} />;"],
  },
  {
    meta: {
      messages: {
        unresolved:
          "'{{token}}' is a kit colour token, and nothing resolves it here: the element receives the name and paints nothing. Resolve it with color('{{token}}') from '#ui/core/color', or declare it through styles(). Run bun run --cwd packages/lint-rules rules no-unresolved-color-tokens for the repair guide.",
      },
    },
    create(context) {
      const scan = { context, reported: new Set() };
      return { ...elementVisitors(scan), ...typedVisitors(scan), ...scriptVisitors(scan) };
    },
  },
);
