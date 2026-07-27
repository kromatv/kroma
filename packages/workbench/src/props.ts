// What a documented prop looks like.
//
// The READING of them used to live here too: a regex parser that ran in the
// browser over the component sources a `?raw` glob had inlined into the bundle.
// It is gone, and the three reasons are worth keeping written down, because they
// are the argument for where it went rather than against having it at all.
//
//   size      every component's source shipped to every visitor - about half a
//             megabyte - so that a panel could show one component at a time.
//   time      52 files re-parsed synchronously before the first paint.
//   truth     a regex cannot follow `extends`, so <Button> documented ten props
//             and actually took eighteen. It also could not resolve an imported
//             type, and it read a formatter-wrapped union as no prop at all.
//
// A type checker fixes the third and running at BUILD time fixes the other two,
// so the job moved to `propDocs` in clients/tv-build, which drives TypeScript's
// own checker over the components and hands the result to `discoverVite` as
// data. Metro has no equivalent and shows no prop docs, which is the same
// graceful degradation demo sources make.

/** One documented prop, as the inspector's Props tab shows it. */
export interface PropDoc {
  name: string;
  /** The type AS WRITTEN - `IconName`, not the 6215-member union it aliases.
   *  Read from the declaration's own source text for exactly that reason. */
  type: string;
  /** False when the prop is required, which the panel marks. */
  optional: boolean;
  /** The JSDoc prose, if the prop carries any. */
  docs?: string;
}
