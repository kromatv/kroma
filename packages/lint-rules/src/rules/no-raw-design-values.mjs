import { defineRule } from '../define-rule.mjs';

function isColour(value) {
  if (value.startsWith('#')) {
    return [4, 5, 7, 9].includes(value.length) && /^#[0-9a-f]+$/i.test(value);
  }
  return /^(?:rgba?|hsla?)\(/i.test(value) && value.endsWith(')');
}

export default defineRule(
  'no-raw-design-values',
  {
    description: 'Use design tokens for component colours, radii, and font sizes.',
    why: 'CONVENTIONS.md prohibits raw design values because they bypass theme changes and quietly create a second palette or type scale. Add a missing token instead of copying its current numeric or colour value.',
    scope:
      'Configured UI consumer source files: literal hex/rgb/rgba/hsl/hsla colours in known colour props/properties, plus literal fontSize, radius, and border-radius values. JSX attributes and object properties are inspected, including static template literals and unary negative numbers.',
    repair:
      'Use a palette token such as surface2 or textDim, a named radius token, and a text variant/type role. For native style objects use the existing token resolver or styles API. Add new design decisions to core/tokens before consuming them. Keep token definitions in the excluded token layer.',
    exceptions:
      'Token/core implementation, icon asset data, tests, and fixture files are excluded by config. Zero is allowed as an explicit radius reset. Names like transparent/currentColor and CSS variables are allowed. Computed values, spreads, CSS text, gradients, named CSS colours, and nonliteral expressions are not inspected. No automatic nearest-token guess.',
    verification:
      'Run bun run lint, UI typecheck, and focused component/theme tests. Review both theme palettes and relevant TV sizes. Source: CONVENTIONS.md, A design value is never written raw.',
    invalid: ["const style = { color: '#ffffff', borderRadius: 8 };"],
    valid: ["const style = { color: 'textDim', radius: 'md' };"],
  },
  {
    meta: {
      messages: {
        violation:
          'This raw colour, radius, or font size bypasses the design system. Use the named palette/radius/type token or add the missing token at its source. Run bun run --cwd packages/lint-rules rules no-raw-design-values for the repair guide.',
      },
    },
    create(context) {
      const colours = new Set([
        'bg',
        'background',
        'backgroundColor',
        'color',
        'borderColor',
        'borderTopColor',
        'borderBottomColor',
        'borderLeftColor',
        'borderRightColor',
        'outlineColor',
        'shadowColor',
        'tintColor',
        'fill',
        'stroke',
      ]);
      const radii = new Set([
        'radius',
        'borderRadius',
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomLeftRadius',
        'borderBottomRightRadius',
      ]);
      function check(node, name, value) {
        if (value?.type === 'JSXExpressionContainer') value = value.expression;
        let literal = value?.type === 'Literal' ? value.value : undefined;
        if (value?.type === 'TemplateLiteral' && !value.expressions.length)
          literal = value.quasis[0].value.cooked;
        if (
          value?.type === 'UnaryExpression' &&
          value.operator === '-' &&
          value.argument.type === 'Literal' &&
          typeof value.argument.value === 'number'
        )
          literal = -value.argument.value;
        const rawColour =
          colours.has(name) && typeof literal === 'string' && isColour(literal.trim());
        const rawMetric =
          (name === 'fontSize' || radii.has(name)) &&
          (typeof literal === 'number' ||
            (typeof literal === 'string' && /^-?\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(literal))) &&
          !(radii.has(name) && Number.parseFloat(String(literal)) === 0);
        if (rawColour || rawMetric) context.report({ node, messageId: 'violation' });
      }
      return {
        Property(node) {
          if (node.parent.type !== 'ObjectExpression') return;
          const name = node.computed ? node.key.value : (node.key.name ?? node.key.value);
          check(node.value, name, node.value);
        },
        JSXAttribute(node) {
          if (node.name.type === 'JSXIdentifier') check(node, node.name.name, node.value);
        },
      };
    },
  },
);
