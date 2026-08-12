// What a story's `play` is handed, and what the run leaves behind for the panel.

/** The matchers `expect(name)` answers. `toHaveText` is a containment test over
 * the text drawn under the control; `not` inverts either, and asserts once
 * rather than waiting for the control to go away. */
interface PlayExpectation {
  readonly not: PlayExpectation;
  toBeVisible(): Promise<void>;
  toHaveText(text: string): Promise<void>;
}

/**
 * A story's interaction script.
 *
 * Everything is addressed by ACCESSIBLE NAME and driven through the press
 * handler behind it, never through a DOM node: the kit renders through
 * react-native-web in a browser and through React Native on a television, and a
 * play has to run on both. A name is a control's `accessibilityLabel`, the
 * `label` prop the kit spells it with, or - failing both - the text it draws.
 */
interface PlayContext {
  press(name: string): Promise<void>;
  type(name: string, text: string): Promise<void>;
  expect(name: string): PlayExpectation;
  step(label: string, body: () => Promise<void> | void): Promise<void>;
}

type PlayFunction = (context: PlayContext) => Promise<void> | void;

type PlayStatus = 'pending' | 'running' | 'passed' | 'failed';

interface PlayStep {
  id: number;
  label: string;
  depth: number;
  status: PlayStatus;
  error?: string;
}

/** A run in progress or finished. `error` carries only what no step claimed:
 * a throw between steps, or a play that declares none. */
interface PlayTranscript {
  status: PlayStatus;
  steps: readonly PlayStep[];
  error?: string;
}

export type { PlayContext, PlayExpectation, PlayFunction, PlayStatus, PlayStep, PlayTranscript };
