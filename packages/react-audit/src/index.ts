// What a React interaction actually costs.
//
//   import { record } from '@kroma/react-audit';
//
//   const run = record();
//   render(<Keyboard />);
//   fireEvent.click(key);
//   const result = run.stop();
//
//   result.churn      // [['Key', 42]]  destroyed and rebuilt
//   result.rerenders  // fibers that ran again
//   result.elements   // host elements on screen, by type
//
// Importing this installs the devtools hook React publishes its fiber tree
// through, which has to happen before react-dom initialises. In a test runner,
// name the package as a setup file. There is a batteries-included wrapper for
// @testing-library users in `@kroma/react-audit/react`.

export type { Commit, Work } from './analyse';
export { churn, components, hosts, rerenders } from './analyse';
export type { Fiber, Root } from './fiber';
export { installHook, isConnected, onCommit, onUnmount } from './hook';
export type { Result } from './record';
export { record, resultOf } from './record';
export { formatResult } from './report';
