"""
Trim UI PNGs in `public/assets/ui/`: remove white / flat-gray checkerboard
margins (alpha), then crop to opaque bbox. Covers run summary + charge meter art.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

UI_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "ui"
FILES = (
    "run_summary_frame.png",
    "run_summary_btn_next.png",
    "run_summary_btn_shop.png",
    "power_charge_bar.png",
    "power_charge_arrow.png",
)


def strip_light_backdrop(rgba: Image.Image) -> Image.Image:
    """Turn white / flat neutral-gray backdrop (checkerboard export) transparent."""
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            spread = max(r, g, b) - min(r, g, b)
            lum = (r + g + b) / 3.0
            # Pure/near-white margins
            if r >= 248 and g >= 248 and b >= 248:
                px[x, y] = (r, g, b, 0)
            # Flat light gray (checkerboard) — keep saturated UI pixels
            elif spread <= 6 and lum >= 210:
                px[x, y] = (r, g, b, 0)
    return rgba


def trim_alpha(im: Image.Image) -> Image.Image:
    alpha = im.split()[-1]
    bbox = alpha.getbbox()
    if bbox:
        return im.crop(bbox)
    return im


def process(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    im = strip_light_backdrop(im)
    im = trim_alpha(im)
    im.save(path, format="PNG", optimize=True)
    print(f"OK {path.name} -> {im.size}")


def main() -> None:
    for name in FILES:
        p = UI_DIR / name
        if not p.is_file():
            raise SystemExit(f"missing {p}")
        process(p)


if __name__ == "__main__":
    main()
