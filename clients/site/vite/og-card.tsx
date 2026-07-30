// `@kroma/ui/tokens/colors`, not `@kroma/ui/tokens`: this module is loaded by the Vite
// config's own loader, which externalizes bare specifiers and hands them to Node, and Node
// cannot resolve the extensionless re-exports inside that barrel. The kit exports the token
// leaf as its own subpath for exactly this, so the card still reaches the real tokens by
// package NAME and stays renderable in-process by the build.
//
// `rich.ts` keeps its extension because Node needs one and it is inside this package (see
// `allowImportingTsExtensions` in tsconfig.json). Both files are dependency-free, so nothing
// else comes along with them.
import { colors, WHEEL_COLORS } from '@kroma/ui/tokens/colors';
import { parseRich } from '../src/lib/rich.ts';

// The social card, as a component.
//
// Rendered by Satori (JSX -> SVG) rather than by a headless browser, which is why
// this is a real .tsx instead of an HTML string: the card is composed, typed and
// reviewable like the rest of the site, and generating it needs no Chromium and no
// network. Colours come from the same @kroma/ui tokens the pages use, so the card
// cannot drift from the brand.
//
// Satori implements a SUBSET of CSS - flexbox only (no grid, no float), and every
// element that has more than one child needs an explicit `display: flex`. Two
// consequences worth knowing before editing:
//
//   * `background-clip: text` is not supported, so the accent words are painted in
//     solid `colors.accent` rather than the page's amber gradient. At card size the
//     difference is invisible; a gradient would silently render as flat black.
//   * There is no `text-wrap: balance`, so the headline's line break is authored
//     (see `title`), not negotiated by the layout engine.

/** A `[bracketed]` run is the amber emphasis; everything else is plain.
 *
 *  Parsed by the site's OWN marker parser rather than a regex here, so the card and the
 *  pages cannot disagree about what `[…]` means - and so the copy in ./og-cards.ts is
 *  literally the convention its comment claims. `lib/rich` is dependency-free, which is
 *  what makes it safe to pull into a renderer that runs outside the app. */
function Headline({ text }: Readonly<{ text: string }>) {
  const runs = parseRich(text);
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        fontFamily: 'Bricolage Grotesque',
        fontSize: 60,
        fontWeight: 800,
        lineHeight: 1.04,
        letterSpacing: '-0.02em',
        color: colors.text,
        maxWidth: 720,
      }}
    >
      {runs.map((run, i) =>
        run.kind === 'accent' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional runs of one immutable string
          <span key={i} style={{ color: colors.accent }}>
            {run.value}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional runs of one immutable string
          <span key={i}>{run.value}</span>
        ),
      )}
    </div>
  );
}

/** The chromatic wheel, from the official lockup's geometry, coloured by token. */
function Wheel({ size }: Readonly<{ size: number }>) {
  const paths = [
    'M209 32.96 L209 0 A50 50 0 0 1 252.3 25 L223.76 41.48 A17.045 17.045 0 0 0 209 32.96 Z',
    'M223.76 41.48 L252.3 25 A50 50 0 0 1 252.3 75 L223.76 58.52 A17.045 17.045 0 0 0 223.76 41.48 Z',
    'M223.76 58.52 L252.3 75 A50 50 0 0 1 209 100 L209 67.05 A17.045 17.045 0 0 0 223.76 58.52 Z',
    'M209 67.05 L209 100 A50 50 0 0 1 165.7 75 L194.24 58.52 A17.045 17.045 0 0 0 209 67.05 Z',
    'M194.24 58.52 L165.7 75 A50 50 0 0 1 165.7 25 L194.24 41.48 A17.045 17.045 0 0 0 194.24 58.52 Z',
    'M194.24 41.48 L165.7 25 A50 50 0 0 1 209 0 L209 32.96 A17.045 17.045 0 0 0 194.24 41.48 Z',
  ];
  return (
    // `role`/`aria-label` rather than a <title> child: Satori lays this tree out
    // and rasterises it, so a title element would be measured as content, while
    // the attributes are ignored. The card's real alt text is the og:image:alt the
    // page's <head> carries.
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="KROMA">
      <g transform="translate(-159 0)">
        {paths.map((d, i) => (
          <path key={d} d={d} fill={WHEEL_COLORS[i]} />
        ))}
      </g>
    </svg>
  );
}

export interface OgCardProps {
  /** The headline, with the amber words in `[brackets]` and `\n` for the break. */
  title: string;
  /** One supporting line under the headline. */
  sub: string;
}

export function OgCard({ title, sub }: Readonly<OgCardProps>) {
  return (
    <div
      style={{
        display: 'flex',
        width: 1200,
        height: 630,
        position: 'relative',
        backgroundColor: colors.bg,
        fontFamily: 'Hanken Grotesk',
      }}
    >
      {/* The single warm light source, top-left. A radial gradient is one of the
          few gradients Satori does support. */}
      <div
        style={{
          position: 'absolute',
          top: -180,
          left: -180,
          width: 900,
          height: 700,
          backgroundImage: `radial-gradient(circle at 30% 30%, rgba(242,180,66,0.20), rgba(242,180,66,0) 70%)`,
        }}
      />
      {/* The hairline frame, the same amber-at-low-alpha the lockup card uses. */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 40,
          right: 40,
          bottom: 40,
          border: `1.5px solid rgba(244,182,66,0.16)`,
          borderRadius: 28,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 26,
          position: 'absolute',
          left: 88,
          top: 0,
          bottom: 0,
          width: 780,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <Wheel size={84} />
          <span
            style={{
              fontFamily: 'Bricolage Grotesque',
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: '0.01em',
              color: colors.text,
            }}
          >
            KROMA
          </span>
        </div>

        <Headline text={title} />

        <div
          style={{
            display: 'flex',
            fontSize: 26,
            lineHeight: 1.4,
            color: colors.textMuted,
            maxWidth: 690,
          }}
        >
          {sub}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 88,
          bottom: 68,
          display: 'flex',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '0.14em',
          color: colors.accent,
        }}
      >
        KROMA.TV
      </div>
    </div>
  );
}
