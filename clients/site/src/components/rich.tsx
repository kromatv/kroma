import { parseRich, type RichToken } from '#site/lib/rich';

/** How each marker renders. Kept here, once, so the amber in a heading and the
 *  mono of a codec chip cannot drift between the pages that use them. */
const CLASS: Record<Exclude<RichToken['kind'], 'text'>, string> = {
  accent: 'text-gradient-amber',
  code: 'font-mono text-[0.92em] text-accent',
  bright: 'text-text',
};

export interface RichProps {
  /** A message straight from a catalog, with `[amber]`, `` `mono` `` and
   *  `*bright*` markers. See lib/rich for why markup travels in the string. */
  children: string;
}

/**
 * Renders a message's markers as styled runs.
 *
 * This is what lets a translated sentence stay ONE string in the `.json` while
 * still carrying the two amber words a heading needs. The alternative - splitting
 * a heading into `before`/`accent`/`after` keys - made translators fill three
 * fragments that only reassembled correctly in English word order.
 */
export function Rich({ children }: Readonly<RichProps>) {
  return (
    <>
      {parseRich(children).map((token, i) =>
        token.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional within one immutable string
          <span key={i}>{token.value}</span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional within one immutable string
          <span key={i} className={CLASS[token.kind]}>
            {token.value}
          </span>
        ),
      )}
    </>
  );
}
