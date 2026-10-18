const requiredText = ['description', 'why', 'scope', 'repair', 'exceptions', 'verification'];

export function defineRule(name, guidance, implementation) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid rule name: ${name}`);
  }
  for (const field of requiredText) {
    if (
      typeof guidance[field] !== 'string' ||
      !guidance[field].trim() ||
      /^\s*TODO\s*:/.test(guidance[field])
    ) {
      throw new Error(`${name}: guidance.${field} must explain the rule.`);
    }
  }
  for (const kind of ['valid', 'invalid']) {
    if (
      !Array.isArray(guidance[kind]) ||
      !guidance[kind].length ||
      guidance[kind].some(
        (example) => typeof example !== 'string' || !example.trim() || /^\s*TODO\s*:/.test(example),
      )
    ) {
      throw new Error(`${name}: guidance.${kind} must contain code examples.`);
    }
  }
  if (
    typeof implementation.create !== 'function' ||
    !Object.keys(implementation.meta?.messages ?? {}).length
  ) {
    throw new Error(`${name}: provide create() and meta.messages.`);
  }
  return {
    ...implementation,
    guidance: { ...guidance, id: `kroma/${name}` },
    meta: {
      type: 'problem',
      schema: [],
      ...implementation.meta,
      docs: {
        description: guidance.description,
        url: `https://github.com/kromatv/kroma/blob/main/packages/lint-rules/README.md#${name}`,
      },
    },
  };
}
