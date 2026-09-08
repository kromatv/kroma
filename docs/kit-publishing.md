# Publishing `@kromatv/ui`

The kit leaves this repository as a built package. The workspace stays
`private` and is consumed as source here, exactly as `@kromatv/sdk` works
(`docs/module-sdk-publishing.md`): `bun run kit:stage --version X.Y.Z` assembles
`packages/ui/dist`, and that directory is what `npm publish` takes.

```bash
bun run kit:stage --version 0.1.0
cd packages/ui/dist && npm publish
```

## What the staged package is

| In it | From |
|---|---|
| `kit.js` and the module tree beside it | a Vite library build of `src`, `preserveModules` |
| `*.d.ts` | `tsc --project tsconfig.dist.json` |
| `styles.css` + `fonts/` | `vite/tokens.ts`, with the faces copied beside the sheet |
| `package.json` | written by `scripts/stage.ts`, not the workspace one |

The build resolves the two rules that make this kit universal, so a consumer
does not have to: `react-native` lands on `react-native-web`, and `.web.*` wins
over its native sibling. It also resolves `#ui/*`, though the emitted
declarations still spell it, which is why the staged `package.json` keeps an
`imports` map pointing at the package's own files.

`react`, `react-dom`, `react-native-web` and `@tabler/icons-react` are peers.

## Consuming it

```tsx
import '@kromatv/ui/styles.css';
import { Button, Text } from '@kromatv/ui';
```

The stylesheet is a real file because the `@import "@kromatv/ui/css"` directive
is expanded by a Vite plugin that only exists in this repo. A consumer needs
`react-native` aliased to `react-native-web` and `global` defined as
`globalThis`, which is the same two lines every browser target here already
carries (`packages/bundler/src/rnw.ts`).

## What the staged package deliberately drops

The brand intro's 4K master and its sting are 11 MB, and `<KromaIntro>` already
falls back to its CSS scene when the video will not play. A design system
shipping someone else's logo reel is 11 MB nobody asked for, so the build
strips both. That is the difference between 1.2 MB and 9.2 MB on npm.

## What is still rough

- **Icons.** `glyph-source.ts` is a namespace import of `@tabler/icons-react`,
  so a consumer's bundler cannot tree-shake it and pays for the whole set. In
  this repo a build-time pass subsets it by scanning the source; a published
  package cannot scan a consumer's. Shipping that pass as a plugin is the fix.
- **Catalogs.** The kit's own chrome says about 95 phrases, and they come from
  `@kromatv/core`'s catalogs, which are bundled whole. A consumer gets KROMA's
  wording, and more of it than the kit uses.
- **Native.** The staged package is web-first: `.web.*` is resolved at build
  time, so React Native consumers still want the workspace source.
