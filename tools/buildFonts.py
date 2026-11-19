"""Builds the font atlas textures in public/images/textures/fonts/.

Each atlas is 512x192: a 16x6 grid of 32px cells holding the characters with codes 33-128
in order ('!' to '~', an empty cell for 127, then the euro sign for 128, as in
Windows-1252), black on white. Shaders find a character by its cell, so keep this layout.

The fonts are SIL Open Font License fonts from https://github.com/google/fonts
(ofl/courierprime, ofl/arimo, ofl/tinos, ofl/inter, ofl/exo2). Download the .ttf files
named in FONTS into one directory, then:

  uv run --with pillow python tools/buildFonts.py FONT_DIR
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "images", "textures", "fonts")
CELL = 32
COLS, ROWS = 16, 6
CAP_HEIGHT = 14  # Pixels; the size of 'H'.
BASELINE = 22  # Pixels from the top of each cell.
THUMB_SCALE = 4

# (output number, font file, variable-font named instance or None)
FONTS = [
    (1, "CourierPrime-Regular.ttf", None),
    (2, "Arimo[wght].ttf", b"Regular"),
    (3, "Tinos-Regular.ttf", None),
    (4, "Inter[opsz,wght].ttf", b"Regular"),
    (5, "Exo2[wght].ttf", b"Regular"),
    (6, "Exo2[wght].ttf", b"Bold"),
]


def characters():
    chars = [chr(c) for c in range(33, 127)] + [None, "€"]
    assert len(chars) == COLS * ROWS
    return chars


def load_font(path, instance, size):
    font = ImageFont.truetype(path, size)
    if instance is not None:
        font.set_variation_by_name(instance)
    return font


def sized_font(path, instance):
    # The largest size whose 'H' is at most CAP_HEIGHT pixels tall.
    for size in range(40, 4, -1):
        font = load_font(path, instance, size)
        left, top, right, bottom = font.getbbox("H", anchor="ls")
        if bottom - top <= CAP_HEIGHT:
            return font
    raise ValueError(f"no size fits for {path}")


def build(font):
    atlas = Image.new("L", (CELL * COLS, CELL * ROWS), 255)
    draw = ImageDraw.Draw(atlas)
    for i, ch in enumerate(characters()):
        if ch is None:
            continue
        x0, y0 = (i % COLS) * CELL, (i // COLS) * CELL
        left, top, right, bottom = font.getbbox(ch, anchor="ls")
        # Centre the ink horizontally; every glyph shares the baseline.
        x = x0 + (CELL - (right - left)) / 2 - left
        draw.text((x, y0 + BASELINE), ch, font=font, fill=0, anchor="ls")
    return atlas.convert("RGB")


def main(font_dir):
    for number, filename, instance in FONTS:
        font = sized_font(os.path.join(font_dir, filename), instance)
        atlas = build(font)
        atlas.save(os.path.join(OUT, f"{number}.png"), optimize=True)
        thumb = atlas.resize(
            (atlas.width // THUMB_SCALE, atlas.height // THUMB_SCALE), Image.LANCZOS)
        thumb.save(os.path.join(OUT, f"{number}_thumb.png"), optimize=True)
        print(f"{number}.png: {filename} {instance or ''} size {font.size}")


if __name__ == "__main__":
    main(sys.argv[1])
