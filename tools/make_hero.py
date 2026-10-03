"""Paints the frames tools/hero.ts computed into a terminal window, as an animated GIF.

The creature is drawn the way the terminal draws the plugin's Raster: each canvas pixel is half
a character cell. The info column follows the layout in hooks/register.tsx (bubble, name line,
experience bar, vitals row).

Usage: python tools/make_hero.py <frames-dir> <out.gif>
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

FONTS = Path("C:/Windows/Fonts")
SIZE = 17
BG = (0x16, 0x16, 0x1E)
CHROME = (0x24, 0x25, 0x33)
FG = (0xC0, 0xCA, 0xF5)
DIM = (0x56, 0x5F, 0x89)
BORDER = (0x3B, 0x40, 0x5A)
TONES = {"good": (0x6F, 0xDC, 0x8C), "warn": (0xFF, 0xC5, 0x3D), "bad": (0xFF, 0x5F, 0x5F), "cold": (0x7F, 0xD3, 0xFF), "dim": DIM}
TRANSPARENT = -1


class Type:
    """Monospace text with per-character fallback, the way a terminal finds missing glyphs."""

    def __init__(self) -> None:
        self.faces = []
        for name in ("CascadiaMono.ttf", "seguisym.ttf", "seguiemj.ttf"):
            path = FONTS / name
            cmap = TTFont(str(path), fontNumber=0).getBestCmap()
            self.faces.append((ImageFont.truetype(str(path), SIZE), cmap, name == "seguiemj.ttf"))
        self.bold = ImageFont.truetype(str(FONTS / "CascadiaMono.ttf"), SIZE)
        self.bold.set_variation_by_name("Bold") if hasattr(self.bold, "set_variation_by_name") else None
        self.cell_w = round(self.faces[0][0].getlength("M"))
        self.cell_h = 22

    def face(self, ch: str):
        for font, cmap, is_emoji in self.faces:
            if ord(ch) in cmap:
                return font, is_emoji
        return self.faces[0][0], False

    def draw(self, d: ImageDraw.ImageDraw, col: int, row: int, text: str, color, x0: int, y0: int, bold: bool = False) -> int:
        """Draws `text` from cell (col, row); returns the column after it. Wide emoji take two cells."""
        for ch in text:
            font, is_emoji = self.face(ch)
            x = x0 + col * self.cell_w
            y = y0 + row * self.cell_h + 2
            if is_emoji:
                d.text((x, y), ch, font=font, embedded_color=True)
                col += 2
            else:
                if bold:
                    d.text((x, y), ch, font=font, fill=color, stroke_width=0)
                    d.text((x + 0.6, y), ch, font=font, fill=color)
                else:
                    d.text((x, y), ch, font=font, fill=color)
                col += 1
        return col


def rgb(c: int):
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255)


def canvas_of(path: Path) -> tuple[int, int, list[int]]:
    raw = path.read_bytes()
    w, h = struct.unpack_from("<II", raw, 0)
    return w, h, list(struct.unpack_from(f"<{w * h}i", raw, 8))


def wrap(text: str, width: int) -> list[str]:
    lines, line = [], ""
    for word in text.split(" "):
        if len(line) + len(word) + (1 if line else 0) > width:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}" if line else word
    return lines + [line]


def xp_bar(into: int, need: int, width: int) -> str:
    filled = min(width, round(into / need * width))
    return "█" * filled + "░" * (width - filled)


def paint(scene: dict, frame: dict, frames_dir: Path, t: Type) -> Image.Image:
    cols = scene["columns"]
    w, h, px = canvas_of(frames_dir / frame["canvas"])
    canvas_rows = (h + 1) // 2
    info_w = max(16, min(56, cols - w - 4))
    accent = rgb(scene["color"])

    # The info column, bottom-aligned beside the canvas: bubble, name, experience, vitals.
    info: list[list[tuple[str, tuple, bool]]] = []
    if frame["bubble"]:
        inner = info_w - 4
        info.append([("╭" + "─" * (info_w - 2) + "╮", accent, False)])
        for line in wrap(frame["bubble"], inner):
            info.append([("│ ", accent, False), (line.ljust(inner), FG, False), (" │", accent, False)])
        info.append([("╰" + "─" * (info_w - 2) + "╯", accent, False)])
    info.append([(scene["name"], accent, True), (f" Lv {scene['level']} · {scene['species']} {scene['stars']}", DIM, False)])
    into, need = scene["xp"]
    info.append([(xp_bar(into, need, 12), accent, False), (f" {into}/{need}", DIM, False)])
    vitals = []
    for i, v in enumerate(frame["vitals"]):
        vitals.append(((" · " if i else "") + v["text"], TONES[v["tone"]], False))
    info.append(vitals)

    band_rows = max(canvas_rows, len(info))
    transcript = frame["transcript"]
    rows = 1 + 2 + 1 + band_rows + 1 + 3 + 1
    title_h = 34
    pad = 14
    width = pad * 2 + (cols + 2) * t.cell_w
    height = title_h + pad + rows * t.cell_h
    img = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(img)

    # Window chrome.
    d.rectangle((0, 0, width, title_h), fill=CHROME)
    for i, color in enumerate(((0xFF, 0x5F, 0x57), (0xFE, 0xBC, 0x2E), (0x28, 0xC8, 0x40))):
        d.ellipse((16 + i * 22, 11, 28 + i * 22, 23), fill=color)
    title = "~/api — claude"
    tw = t.faces[0][0].getlength(title)
    d.text(((width - tw) / 2, 8), title, font=t.faces[0][0], fill=DIM)

    x0, y0 = pad + t.cell_w, title_h + pad
    for i, line in enumerate(transcript[:2]):
        t.draw(d, 0, 1 + i, line, FG if i == 0 else DIM, x0, y0)

    band_top = 4
    # The canvas: two pixels per cell, painted as squares.
    pw, ph = t.cell_w, t.cell_h / 2
    canvas_top = band_top + (band_rows - canvas_rows)
    for y in range(h):
        for x in range(w):
            c = px[y * w + x]
            if c == TRANSPARENT:
                continue
            left = x0 + x * pw
            top = y0 + canvas_top * t.cell_h + y * ph
            d.rectangle((left, top, left + pw - 1, top + ph - 1), fill=rgb(c))
    info_col = w + 1
    info_top = band_top + (band_rows - len(info))
    for r, spans in enumerate(info):
        col = info_col
        for text, color, bold in spans:
            col = t.draw(d, col, info_top + r, text, color, x0, y0, bold)

    # The prompt box.
    box_top = band_top + band_rows + 1
    t.draw(d, 0, box_top, "╭" + "─" * (cols - 2) + "╮", BORDER, x0, y0)
    t.draw(d, 0, box_top + 1, "│ > ", BORDER, x0, y0)
    t.draw(d, cols - 1, box_top + 1, "│", BORDER, x0, y0)
    d.rectangle((x0 + 4 * t.cell_w, y0 + (box_top + 1) * t.cell_h + 3, x0 + 5 * t.cell_w - 2, y0 + (box_top + 2) * t.cell_h - 3), fill=FG)
    t.draw(d, 0, box_top + 2, "╰" + "─" * (cols - 2) + "╯", BORDER, x0, y0)
    return img


def main() -> None:
    frames_dir = Path(sys.argv[1])
    out = Path(sys.argv[2])
    scene = json.loads((frames_dir / "scene.json").read_text(encoding="utf-8"))
    t = Type()
    images = [paint(scene, f, frames_dir, t) for f in scene["frames"]]
    # One palette for every frame, so text does not shimmer between frames.
    sample = Image.new("RGB", (images[0].width, images[0].height * 6))
    for i, k in enumerate(range(0, len(images), max(1, len(images) // 6))[:6]):
        sample.paste(images[k], (0, i * images[0].height))
    palette = sample.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    frames = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
    out.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=scene["ms"], loop=0, optimize=True, disposal=1)
    print(f"{out.name}: {len(frames)} frames, {images[0].size}, {out.stat().st_size // 1024} KiB")
    images[105].save(out.with_suffix(".frame.png"))


if __name__ == "__main__":
    main()
