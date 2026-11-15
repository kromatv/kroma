import { basename } from 'node:path';
import { defineRule } from '../define-rule.mjs';

const ROLES = new Set(['component', 'hook']);
const UNJUDGED = new Set(['test', 'fixture', 'fixtures', 'story', 'demo', 'd', 'gen', 'config']);
const ENTRIES = new Set(['index', 'main', 'mount', 'sw']);
const FUNCTIONS = new Set([
  'FunctionDeclaration',
  'ArrowFunctionExpression',
  'FunctionExpression',
  'CallExpression',
]);

function isPascal(name) {
  return /^[A-Z][A-Za-z0-9]+$/.test(name) && /[a-z]/.test(name);
}

function kebab(name) {
  return name
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function isRoleName(name) {
  return isPascal(name) || /^use[A-Z0-9]/.test(name);
}

function roleOfName(name, jsx) {
  if (/^use[A-Z0-9]/.test(name)) {
    return 'hook';
  }
  return jsx && isPascal(name) ? 'component' : 'other';
}

function isNamedPart(id, init) {
  return FUNCTIONS.has(init?.type) || isPascal(id.name);
}

function functionsIn(declaration) {
  if (!declaration) {
    return [];
  }
  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations
      .filter(({ id, init }) => id.type === 'Identifier' && isNamedPart(id, init))
      .map(({ id }) => id.name);
  }
  const named = FUNCTIONS.has(declaration.type) && declaration.id;
  return named ? [declaration.id.name] : [];
}

function localFunctions(program) {
  return new Set(program.body.flatMap((statement) => functionsIn(statement)));
}

function exportedFunctions(node, locals) {
  if (node.declaration) {
    return functionsIn(node.declaration);
  }
  if (node.exportKind === 'type' || !node.specifiers) {
    return [];
  }
  const values = node.specifiers.filter((specifier) => specifier.exportKind !== 'type');
  const kept = node.source
    ? values.filter((specifier) => isRoleName(specifier.exported.name))
    : values.filter((specifier) => locals.has(specifier.local.name));
  return kept.map((specifier) => specifier.exported.name);
}

function parts(filename) {
  const [stem, ...rest] = basename(filename).split('.');
  const extension = rest.at(-1);
  return {
    stem,
    segments: rest.slice(0, -1),
    jsx: extension === 'tsx',
    typed: extension === 'ts' || extension === 'tsx',
  };
}

function expectedRole(names, { stem, jsx }) {
  const roles = names.map((name) => ({ name, role: roleOfName(name, jsx) }));
  const own = roles.find(({ name }) => kebab(name) === stem);
  if (own) {
    return own.role;
  }
  const kinds = new Set(roles.map(({ role }) => role));
  return kinds.size === 1 ? roles[0].role : 'other';
}

export default defineRule(
  'file-role',
  {
    description: 'A file that exports a component or a hook says so in its name.',
    why: 'An editor tab, a stack trace and a search result show a file name and nothing else. button.component.tsx and use-focus.hook.ts say what the file holds before it is opened, and a file that claims a role it does not have is caught here instead of in review.',
    scope:
      'TypeScript source files. The role is read from the functions the file exports: the export named after the file decides, and when none is, the exports decide if they all agree. A component is a PascalCase function in a .tsx file. A hook is a function named use followed by a capital. A platform half keeps its platform last: button.component.web.tsx.',
    repair:
      'Rename the file to <name>.component.tsx or <name>.hook.ts and update its imports. When a file exports a component and a hook that are both worth a name, split it in two.',
    exceptions:
      'Entry files (index, main, mount, sw), tests, fixtures, stories, demos, declaration, generated and config files are not judged. A file whose exports are neither, or that mixes them with no export named after the file, takes no role and keeps a plain name. Files a router names (routes/, app/) are switched off in the config.',
    verification:
      'Run bun run lint and the workspace typecheck. Source: CONVENTIONS.md, A file name says what it exports.',
    invalid: [
      '// button.tsx\nexport function Button() { return <button />; }',
      '// use-focus.ts\nexport function useFocus() {}',
      '// colors.hook.ts\nexport function tint() {}',
    ],
    valid: [
      '// button.component.tsx\nexport function Button() { return <button />; }',
      '// use-focus.hook.ts\nexport function useFocus() {}',
      '// colors.ts\nexport function tint() {}',
    ],
  },
  {
    meta: {
      messages: {
        missing:
          'This file exports a {{role}}: name it {{stem}}.{{role}}{{rest}}. Run bun run --cwd packages/lint-rules rules file-role for the repair guide.',
        wrong:
          'This file is named as a {{claimed}} and does not export one. Give it a plain name or the role it has. Run bun run --cwd packages/lint-rules rules file-role for the repair guide.',
      },
    },
    create(context) {
      const file = parts(context.filename);
      const claimed = file.segments.find((segment) => ROLES.has(segment));
      const skipped = ENTRIES.has(file.stem) || file.segments.some((s) => UNJUDGED.has(s));
      if (skipped || !file.typed) {
        return {};
      }
      const exported = [];
      let locals = new Set();
      const collect = (node) => exported.push(node);
      return {
        Program(node) {
          locals = localFunctions(node);
        },
        ExportNamedDeclaration: collect,
        ExportDefaultDeclaration: collect,
        'Program:exit'(node) {
          const names = exported.flatMap((exportNode) => exportedFunctions(exportNode, locals));
          const role = names.length ? expectedRole(names, file) : 'other';
          const rest = ['', ...file.segments.filter((s) => !ROLES.has(s))].join('.');
          if (ROLES.has(role) && claimed !== role) {
            const data = { role, stem: file.stem, rest: `${rest}.${file.jsx ? 'tsx' : 'ts'}` };
            context.report({ node, messageId: 'missing', data });
          }
          if (claimed && claimed !== role && !ROLES.has(role)) {
            context.report({ node, messageId: 'wrong', data: { claimed } });
          }
        },
      };
    },
  },
);
