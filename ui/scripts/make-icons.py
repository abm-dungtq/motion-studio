#!/usr/bin/env python3
# ui/scripts/make-icons.py — the app icons of the install manifest (ui/public/icons/), drawn from
# the favicon of ui/index.html: a 16-unit rounded square (rx 3) in #1f4fd6 with a white play
# triangle M6 4 l6 4 -6 4. The maskable icon fills the whole square with the colour and keeps
# the triangle inside the 80% safe zone. Run: ~/.claude/skills/.venv/bin/python3 ui/scripts/make-icons.py
from pathlib import Path

from PIL import Image, ImageDraw

BLUE = (0x1F, 0x4F, 0xD6, 255)
WHITE = (255, 255, 255, 255)
TRIANGLE = [(6, 4), (12, 8), (6, 12)]
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
SS = 4  # supersampling, for smooth edges


def icon(size: int, maskable: bool) -> Image.Image:
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    unit = big / 16
    if maskable:
        d.rectangle([0, 0, big, big], fill=BLUE)
        # The favicon's 16 units scaled to 80% of the square, centred.
        unit, off = big * 0.8 / 16, big * 0.1
    else:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=3 * unit, fill=BLUE)
        off = 0
    d.polygon([(off + x * unit, off + y * unit) for x, y in TRIANGLE], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, maskable in [("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True)]:
        icon(size, maskable).save(OUT / name, optimize=True)
        print(OUT / name)


if __name__ == "__main__":
    main()
