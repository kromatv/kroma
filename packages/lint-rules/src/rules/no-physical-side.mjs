import { defineRule } from '../define-rule.mjs';

const PHYSICAL_KEY =
  /^(?:padding|margin)(?:Left|Right)$|^border(?:Left|Right)(?:Width|Color|Style)?$|^border(?:Top|Bottom)(?:Left|Right)Radius$/;
const INSETS = new Set(['left', 'right']);
const SHORTHANDS = new Set(['pl', 'pr', 'ml', 'mr']);
const STYLE_CALLS = new Set(['styles', 'style', 'sv', 'sharedStyle']);
const STYLE_NAME = /^style$|Style$/;
const PASS_THROUGH = new Set([
  'ArrayExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'JSXExpressionContainer',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'ParenthesizedExpression',
]);

function keyName(property) {
  if (property.computed) {
    return property.key.type === 'Literal' ? String(property.key.value) : '';
  }
  return property.key.name ?? String(property.key.value);
}

function sideOf(name) {
  return /left/i.test(name) ? 'left' : 'right';
}

function oppositeOf(name) {
  return name.replace(
    /left|right|Left|Right/,
    (word) => ({ left: 'right', right: 'left', Left: 'Right', Right: 'Left' })[word],
  );
}

function literalOf(node) {
  return node?.type === 'Literal' ? node.value : undefined;
}

function mentionsSide(node, side) {
  if (!node || typeof node !== 'object') {
    return false;
  }
  if (node.type === 'Identifier') {
    return node.name === side;
  }
  if (node.type === 'MemberExpression' && !node.computed && node.property.name === side) {
    return true;
  }
  return ['object', 'left', 'right', 'argument', 'expression', 'test', 'consequent', 'alternate']
    .map((field) => node[field])
    .concat(node.arguments ?? [])
    .some((child) => mentionsSide(child, side));
}

function isStyleCall(node) {
  const callee = node.callee;
  if (callee.type === 'Identifier') {
    return STYLE_CALLS.has(callee.name);
  }
  return (
    callee.type === 'MemberExpression' &&
    callee.object.name === 'StyleSheet' &&
    callee.property.name === 'create'
  );
}

function isStyleHolder(node, child) {
  if (node.type === 'JSXAttribute') {
    return STYLE_NAME.test(node.name.name ?? '');
  }
  if (node.type === 'Property') {
    return node.value === child && STYLE_NAME.test(keyName(node));
  }
  return node.type === 'CallExpression' && node.arguments.includes(child) && isStyleCall(node);
}

function inStyle(object) {
  let child = object;
  for (let node = object.parent; node; node = node.parent) {
    if (isStyleHolder(node, child)) {
      return true;
    }
    const nested = node.type === 'Property' && node.value === child;
    if (!nested && node.type !== 'ObjectExpression' && !PASS_THROUGH.has(node.type)) {
      return false;
    }
    child = node;
  }
  return false;
}

function mirrored(property, siblings) {
  const value = literalOf(property.value);
  const opposite = oppositeOf(keyName(property));
  return (
    value !== undefined &&
    siblings.some(
      (other) =>
        other.type === 'Property' &&
        keyName(other) === opposite &&
        literalOf(other.value) === value,
    )
  );
}

function neutral(property, siblings) {
  const value = property.value;
  if (literalOf(value) === '50%' || mentionsSide(value, sideOf(keyName(property)))) {
    return true;
  }
  return mirrored(property, siblings);
}

function isSide(name, object) {
  return PHYSICAL_KEY.test(name) || (INSETS.has(name) && inStyle(object));
}

function physical(property, object) {
  if (property.type !== 'Property' || property.value.type === 'ObjectExpression') {
    return null;
  }
  const name = keyName(property);
  if (name === 'textAlign') {
    return INSETS.has(literalOf(property.value)) ? 'align' : null;
  }
  return isSide(name, object) && !neutral(property, object.properties) ? 'side' : null;
}

function attributeValue(attribute) {
  const value = attribute.value;
  return value?.type === 'JSXExpressionContainer' ? value.expression : value;
}

function isLength(node) {
  if (node?.type === 'UnaryExpression') {
    return isLength(node.argument);
  }
  return node?.type === 'Literal' || node?.type === 'TemplateLiteral';
}

function attributeProblem(attribute) {
  const name = attribute.name.name;
  const value = attributeValue(attribute);
  if (SHORTHANDS.has(name)) {
    return 'side';
  }
  if (name === 'textAlign') {
    return INSETS.has(literalOf(value)) ? 'align' : null;
  }
  return INSETS.has(name) && isLength(value) ? 'side' : null;
}

export default defineRule(
  'no-physical-side',
  {
    description:
      'Lay out by start and end, never by left and right: no physical side in a style, a layout shorthand or a text alignment.',
    why: 'A language written right to left mirrors the whole interface, and only a start or an end turns with it. react-native-web ranks paddingLeft above paddingStart while Yoga ranks it below, so a physical side next to a logical one also lays out differently on the browser targets and on native. Keeping every side logical is what makes adding Arabic or Hebrew a change to no screen.',
    scope:
      'Files under packages/ui/src/components, packages/tv/src, the clients, apps/kit/src and the module frontends (configured in .oxlintrc.json): paddingLeft/Right, marginLeft/Right, borderLeft*/borderRight* and the four physical corner radii in any object; left and right in a style (a style or *Style prop or property, styles(), style(), sv(), sharedStyle(), StyleSheet.create()); the pl, pr, ml and mr props and a left or right prop given a length; textAlign left or right.',
    repair:
      "Write the logical name: ps/pe/ms/me, start/end, paddingStart, marginEnd, borderStartWidth, borderTopStartRadius, textAlign 'start' or 'end'. Where the side really is physical (a seek bar, a chart, a picture, a code listing), give the box that holds it dir=\"ltr\" and write start and end inside it: the box keeps that direction in every language. A value only a render can compute (a slide's sign, a swipe) reads useDirection().",
    exceptions:
      'packages/ui/src/core and packages/ui/src/lib are not in scope: the engine turns a side measured on screen into one laid out. A side whose value reads the same side of a measured box or of the safe-area insets (left: rect.left, paddingLeft: insets.left) is physical by nature and allowed, as are a side at 50% (the middle of either direction) and a symmetric pair (left: 0 with right: 0). Tests and declaration files are not checked.',
    verification:
      'Run bun run lint, the ui, tv and web typechecks, and look at the screen with a right-to-left locale next to a left-to-right one: the layout mirrors and the media chrome does not.',
    invalid: [
      'const s = styles({ lead: { paddingLeft: 12 } });',
      'const node = <Box pl={12} />;',
      "const node = <View style={{ position: 'absolute', right: 8 }} />;",
      "const s = styles({ label: { textAlign: 'left' } });",
    ],
    valid: [
      'const s = styles({ lead: { ps: 12 } });',
      "const node = <View style={{ position: 'absolute', end: 8 }} />;",
      'const node = <View style={{ left: rect.left, top: rect.top }} />;',
      'const node = <Header right={<Close />} />;',
    ],
  },
  {
    meta: {
      messages: {
        side: 'A physical side does not mirror in a language written right to left. Write start or end (ps, me, paddingStart, borderEndWidth), or hold what must stay physical in a box with dir="ltr". Run bun run --cwd packages/lint-rules rules no-physical-side.',
        align:
          "textAlign left or right does not follow the writing direction. Write 'start' or 'end'. Run bun run --cwd packages/lint-rules rules no-physical-side.",
      },
    },
    create(context) {
      return {
        ObjectExpression(node) {
          for (const property of node.properties) {
            const messageId = physical(property, node);
            if (messageId) {
              context.report({ node: property, messageId });
            }
          }
        },
        JSXAttribute(node) {
          const messageId = typeof node.name.name === 'string' ? attributeProblem(node) : null;
          if (messageId) {
            context.report({ node, messageId });
          }
        },
      };
    },
  },
);
