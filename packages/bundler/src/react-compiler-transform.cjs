// One React 19 compiler pass shared by Vite and source audits.
// Preserve JSX: the host bundler still owns Refresh and platform JSX lowering.
const { transformSync } = require('oxc-transform-react');

function compileReactSource(source, id, sourcemap = true, reportDiagnostics = false) {
  if (id.includes('node_modules') || id.startsWith('\0')) return null;
  const [filename, query = ''] = id.split('?');
  if (/(?:^|&)(?:raw|url)(?:&|$)/.test(query)) return null;
  if (!/\.(?:[cm]?[jt]sx?)$/.test(filename) || /\.d\.[cm]?ts$/.test(filename)) return null;
  const result = transformSync(filename, source, {
    sourcemap,
    jsx: 'preserve',
    reactCompiler: { target: '19', reportDiagnostics },
  });
  if (result.fatal) {
    throw new SyntaxError(
      `${filename}: ${result.errors.map((error) => error.codeframe ?? error.message).join('\n')}`,
    );
  }
  return result;
}
module.exports = { compileReactSource };
