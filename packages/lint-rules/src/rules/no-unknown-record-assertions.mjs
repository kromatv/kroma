import { defineRule } from '../define-rule.mjs';

export default defineRule(
  'no-unknown-record-assertions',
  {
    description:
      'Parse unknown object shapes with a schema instead of asserting Record<string, unknown>.',
    why: 'CONVENTIONS.md names as Record<string, unknown> as a validation bypass: the compiler is instructed to trust a shape that was never checked. A Zod schema produces an earned type and bounded validation.',
    scope:
      'TypeScript as-expressions and angle-bracket assertions whose target is the unqualified type Record<string, unknown>, including assertions inside double casts.',
    repair:
      'At a trust boundary, define a bounded Zod object schema and use parse or safeParse. Infer the resulting type from the schema. Inside trusted code, model the actual type or use an assignable annotation/satisfies instead of asserting. Preserve a byte-size limit before parsing external bodies.',
    exceptions:
      'Record type annotations, satisfies checks, schema outputs, and Record with other key/value types are outside this narrow rule. It is a syntax check, not proof of complete trust-boundary validation; type aliases and qualified types are not inspected. No automatic schema can be inferred safely.',
    verification:
      'Run bun run lint, typecheck, and tests rejecting missing fields, wrong types, oversized strings, and unknown external input. Source: CONVENTIONS.md, Validate with zod, never by hand.',
    invalid: ['const data = input as Record<string, unknown>;'],
    valid: [
      'const data = Notification.safeParse(input);',
      'const data: Record<string, unknown> = knownObject;',
    ],
  },
  {
    meta: {
      messages: {
        violation:
          'Record<string, unknown> assertions bypass shape validation. Parse external input with a bounded Zod schema, or model the trusted value without a cast. Run bun run lint:rules no-unknown-record-assertions for the repair guide.',
      },
    },
    create(context) {
      function check(node) {
        const type = node.typeAnnotation;
        if (
          type.type !== 'TSTypeReference' ||
          type.typeName.type !== 'Identifier' ||
          type.typeName.name !== 'Record'
        )
          return;
        const parameters = (type.typeArguments ?? type.typeParameters)?.params;
        if (
          parameters?.length === 2 &&
          parameters[0].type === 'TSStringKeyword' &&
          parameters[1].type === 'TSUnknownKeyword'
        ) {
          context.report({ node, messageId: 'violation' });
        }
      }
      return { TSAsExpression: check, TSTypeAssertion: check };
    },
  },
);
