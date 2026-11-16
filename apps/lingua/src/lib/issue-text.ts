import { MAX_MESSAGE } from '#site/core/checks';
import type { Issue } from '#site/lib/views';

const TEXT: Record<Issue['code'], (detail: string | undefined) => string> = {
  'unknown-token': (detail) =>
    detail ? `\`{${detail}}\` is not in the source` : 'A placeholder is not in the source',
  'missing-token': (detail) =>
    detail
      ? `\`{${detail}}\` from the source is missing`
      : 'A placeholder from the source is missing',
  'unknown-ref': (detail) =>
    detail
      ? `\`$t(${detail})\` names no message of this project`
      : 'A `$t()` names no message of this project',
  'too-long': () => `Longer than ${MAX_MESSAGE.toLocaleString('en-US')} characters`,
  'control-character': () => 'Contains an invisible control character',
};

/** The one sentence a translator reads for an issue the server found in their text. */
export function issueText({ code, detail }: Issue): string {
  return TEXT[code](detail);
}
