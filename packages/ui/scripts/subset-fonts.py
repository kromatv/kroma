#!/usr/bin/env python3
"""Derives the shipped woff2 faces from the upstream ones beside them.

`src/assets/fonts/upstream/` holds the files Google Fonts serves for the two
families, one per unicode subset, already cut to the ranges `fontsCss()`
declares. What it does not cut is the weight axis: Hanken Grotesk arrives as
100-900 and Bricolage Grotesque as 200-800, while the stylesheet declares
`font-weight: 400 800`. Every instance outside that range is unreachable - the
browser clamps to the descriptor - yet its variation deltas ride in the
download, and on Hanken they are a third of the file.

So the axis is RESTRICTED, not pinned: 400 through 800 stay interpolable and
identical, and Bricolage's `opsz` axis is left alone so optical sizing keeps
working. Glyph names go too; `post` 2.0 is a desktop concern no browser reads.

Rerunning is byte-stable, so the committed output is the check. Widening the
declared range means editing WEIGHT here and rerunning, which is the whole
reason upstream is kept.

    pip install "fonttools[woff]" brotli
    bun run --filter '@kroma/ui' subset-fonts
"""

import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ModuleNotFoundError:
    sys.exit('subset-fonts needs fontTools: pip install "fonttools[woff]" brotli')

FONTS = Path(__file__).resolve().parents[1] / "src/assets/fonts"

# The `font-weight` descriptor in packages/ui/vite/tokens.ts `fontsCss()`, pinned
# against these files by src/assets/fonts.test.ts.
WEIGHT = (400, 800)


def restrict(source: Path, out: Path) -> tuple[int, int]:
    font = TTFont(source, recalcTimestamp=False)
    if "wght" not in {a.axisTag for a in font["fvar"].axes}:
        raise SystemExit(f"{source.name}: no wght axis to restrict")
    font = instancer.instantiateVariableFont(
        font, {"wght": WEIGHT}, updateFontNames=False, inplace=True
    )
    font["post"].formatType = 3.0
    font.flavor = "woff2"
    font.save(out)
    return source.stat().st_size, out.stat().st_size


total_before = 0
total_after = 0
for source in sorted((FONTS / "upstream").glob("*.woff2")):
    before, after = restrict(source, FONTS / source.name)
    total_before += before
    total_after += after
    print(f"{source.name}  {before} -> {after} B  ({after - before:+d})")

print(f"total  {total_before} -> {total_after} B  ({total_after - total_before:+d})")
