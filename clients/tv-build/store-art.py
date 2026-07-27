#!/usr/bin/env python3
"""Composes the store artwork both TV stores require, from the brand sources.

Deliverables (sizes are the stores' own, not ours):

  clients/webos/public/splash.png     1920x1080  in-package; appinfo.splashBackground.
                                                 LG rejects a black screen, so the
                                                 canvas carries a real gradient.
  clients/webos/store/icon-512.png     512x512   Seller Lounge app icon (min 400x400).
  clients/tizen/store/logo-1920.png   1920x1080  transparent 32-bit RGBA, <=300kB.
  clients/tizen/store/bg-1920.png     1920x1080  24-bit RGB backdrop, <=300kB.
  clients/tizen/store/icon-512x423.png 512x423   <=300kB.

Samsung composites its own 16:9 and 1:1 tiles from the logo+background pair, which
is why the logo must be transparent and the background must carry no text.

Run through `bun run store:art` (which rasterises the lockup first).
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
WORK = Path(sys.argv[1])

# Brand tokens, straight from packages/ui/src/styles/tokens/colors.css.
BG = (0x0A, 0x0A, 0x0C)
ACCENT = (0xF4, 0xB6, 0x42)


def backdrop(width: int, height: int) -> Image.Image:
    """The brand canvas: near-black lifted by a soft off-centre amber bloom.

    Flat #0A0A0C reads as "a black screen", which is the one thing LG names as a
    splash rejection. The bloom is subtle enough to stay behind a logo and strong
    enough that the panel is visibly rendering something.
    """
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    # Bloom centred slightly above the middle, falling off over ~70% of the
    # diagonal, squared so the centre stays soft rather than banding.
    cx, cy = width * 0.5, height * 0.42
    reach = float(np.hypot(width, height)) * 0.70
    fall = np.clip(1.0 - np.hypot(x - cx, y - cy) / reach, 0.0, 1.0) ** 2.0

    base = np.array(BG, dtype=np.float32)
    warm = np.array(ACCENT, dtype=np.float32)
    # 9% peak mix: present, never a spotlight.
    rgb = base[None, None, :] + (warm - base)[None, None, :] * (fall * 0.09)[:, :, None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))


def centred(canvas: Image.Image, art: Image.Image, width_frac: float, dy: int = 0) -> None:
    """Paste `art` centred on `canvas`, scaled to `width_frac` of the canvas width."""
    target_w = int(canvas.width * width_frac)
    target_h = round(art.height * target_w / art.width)
    art = art.resize((target_w, target_h), Image.LANCZOS)
    canvas.paste(
        art,
        ((canvas.width - target_w) // 2, (canvas.height - target_h) // 2 + dy),
        art if art.mode == "RGBA" else None,
    )


def save(img: Image.Image, path: Path, limit_kb: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    size_kb = path.stat().st_size / 1024
    if limit_kb and size_kb > limit_kb:
        # Quantise to a 256-colour palette and retry: these are flat brand
        # canvases, so the banding cost is invisible and the saving is large.
        mode = "RGBA" if img.mode == "RGBA" else "RGB"
        img.convert("P", palette=Image.ADAPTIVE, colors=256).convert(mode).save(
            path, "PNG", optimize=True
        )
        size_kb = path.stat().st_size / 1024
    flag = "" if not limit_kb or size_kb <= limit_kb else f"  !! over {limit_kb}kB"
    print(f"{path.relative_to(REPO)}  {img.width}x{img.height}  {size_kb:.0f}kB{flag}")


lockup = Image.open(WORK / "lockup-ivory.png").convert("RGBA")
icon = Image.open(REPO / "clients/tizen/public/icon.png").convert("RGBA")

# --- LG -------------------------------------------------------------------
splash = backdrop(1920, 1080)
centred(splash, lockup, 0.34)
save(splash, REPO / "clients/webos/public/splash.png")

# Seller Lounge store icon. The 512x512 app icon already is the wheel on the
# brand background, which is what makes the tile colour (#0A0A0C) match it.
save(icon.convert("RGB"), REPO / "clients/webos/store/icon-512.png")

# --- Samsung --------------------------------------------------------------
# Logo layer: transparent, so Samsung can lay it over its own tile shapes.
logo = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
centred(logo, lockup, 0.34)
save(logo, REPO / "clients/tizen/store/logo-1920.png", limit_kb=300)

# Background layer: the same canvas, with no mark on it.
save(backdrop(1920, 1080), REPO / "clients/tizen/store/bg-1920.png", limit_kb=300)

# 512x423 icon: the wheel letterboxed to the odd aspect. FLAT #0A0A0C, not the
# bloom - the source icon carries its own opaque brand background, and over a
# gradient that square reads as a seam around the artwork.
tile = Image.new("RGB", (512, 423), BG)
centred(tile, icon, 0.62)
save(tile, REPO / "clients/tizen/store/icon-512x423.png", limit_kb=300)
