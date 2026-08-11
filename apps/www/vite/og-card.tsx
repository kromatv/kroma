// `@kroma/ui/tokens/colors`, not `@kroma/ui/tokens`: this module is loaded by
// Vite config's own loader, which externalizes bare specifiers to Node, and
// Node cannot resolve the extensionless re-exports inside that barrel. The
// kit exports the token leaf as its own subpath for exactly this.
//
// `rich.ts` keeps its extension because Node needs one inside this package
// (see `allowImportingTsExtensions` in tsconfig.json).
import { colors, WHEEL_COLORS, withAlpha } from '@kroma/ui/tokens/colors';
import { parseRich } from '../src/lib/rich.ts';

// Rendered by Satori (JSX -> SVG) rather than a headless browser, so this is
// a real .tsx instead of an HTML string, and needs no Chromium and no network.
//
// Satori implements a SUBSET of CSS: flexbox only (no grid, no float), and
// every element with more than one child needs an explicit `display: flex`.
// Also worth knowing before editing:
//
//   * `background-clip: text` is not supported, so the accent words are
//     painted in solid `colors.accent` rather than the page's amber gradient.
//   * There is no `text-wrap: balance`, so the headline's line break is
//     authored (see `title`), not negotiated by the layout engine.

// Parsed by the site's own marker parser rather than a regex here, so the
// card and the pages cannot disagree about what `[…]` means. `lib/rich` is
// dependency-free, which is what makes it safe to pull into this renderer.
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
  title: string;
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
      {/* A radial gradient is one of the few gradients Satori supports. */}
      <div
        style={{
          position: 'absolute',
          top: -180,
          left: -180,
          width: 900,
          height: 700,
          backgroundImage: `radial-gradient(circle at 30% 30%, ${withAlpha(colors.accentWash, 0.2)}, ${withAlpha(colors.accentWash, 0)} 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 40,
          right: 40,
          bottom: 40,
          border: `1.5px solid ${withAlpha(colors.accent, 0.16)}`,
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
