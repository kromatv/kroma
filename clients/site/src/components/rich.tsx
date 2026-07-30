import { parseRich, type RichToken } from '#site/lib/rich';

const CLASS: Record<Exclude<RichToken['kind'], 'text'>, string> = {
  accent: 'text-gradient-amber',
  code: 'font-mono text-[0.92em] text-accent',
  bright: 'text-text',
};

export interface RichProps {
  children: string;
}

/** Renders a message's markers as styled runs, so a translated sentence stays
 * ONE string in the `.json`. */
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
