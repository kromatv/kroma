# Oxc React Compiler

The shared Vite pipeline uses `oxc-transform-react` **0.154.0**, pinned in
`@kromatv/bundler`, targeting React 19. This replaces the separate Babel React
Compiler pass in web, Tizen, webOS, desktop and workbench shells. React 19
already supplies `react/compiler-runtime`; no runtime package is added.

[Upstream documentation](https://oxc.rs/docs/guide/usage/transformer/react-compiler)
marks this Rust compiler experimental. The version is pinned so upgrades remain
reviewable. Native Expo shells keep Expo's supported Babel compiler pipeline;
switching Metro also requires composing the extra pass's source maps.

## Integration

`reactCompiler()` runs before Vite's JSX lowering and Fast Refresh. It preserves
JSX, removes TypeScript and returns Oxc's source map for Vite to compose. Fatal
parse/compiler errors fail the build with the source filename. Dependencies,
virtual modules, declaration files, asset imports and Markdown are excluded.
Recoverable compiler bailouts keep valid unoptimized code, matching upstream's
normal behavior; `bun run kit:compiler` reports them and exits unsuccessfully
until they are fixed. `"use no memo"` remains an explicit upstream directive.

The compiler also runs in the `audit` Vitest project. The allocation scanner
reads Oxc output; Babel remains only as its AST visitor and TypeScript parser.
The old bundler dependencies on `@rolldown/plugin-babel` and
`babel-plugin-react-compiler` are removed. Expo owns its native compiler dependency.

No root package script is added. Existing commands still apply:

```sh
bun run kit:compiler
bun x vitest run --project audit
bun run build:web
```

The initial Oxc scan found seven diagnostics in five files. Repairs preserve
callback dependencies explicitly, replace one unsupported logical assignment,
reset resume refs inside an effect, return a focus attachment callback instead
of mutating another hook's ref, and update the playback client ref after commit.
The resulting scan covers **674 files**, with **331 files receiving memo caches**
and **zero diagnostics**. This is a file count, not a count of React components.

## Performance

A local comparison measured the same 674 source files with React 19, preserved
JSX and source maps enabled. After one complete warmup for each compiler, five
rounds alternate execution order. Oxc's median was about **0.26 seconds**, versus
**4.48 seconds** for Babel, roughly **17 times faster** for the compiler pass.
This does not imply a 17-times faster full build or identical generated output.
The full web build and compiler-enabled kit audit pass.

The [raw samples](react-compiler-results.json) include versions, host details and
source hashes. Reproduce from the repository root with Node:

```sh
node packages/bundler/scripts/compare-react-compiler.mjs > /tmp/react-compiler-results.json
```

The Babel reference is resolved from the native Expo preset, which still declares
that compiler. Both compilers see identical input, including any files they elect
not to memoize. Both compilers emitted memo caches in 331 files. The runtime regression fixture verifies stable child prop identity
through an unrelated parent update; plugin tests cover source maps, transform
ordering, opt-out directives, fatal errors and excluded inputs.
