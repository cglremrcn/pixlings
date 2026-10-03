"""Assembles the frames tools/media.ts renders into labelled GIFs for the README.

Usage: python tools/make_gifs.py <frames-dir> <out-dir>
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SCALE = 6
BG = (0x1A, 0x1B, 0x26)
LABEL = (0xA9, 0xB1, 0xD6)
PAD = 2 * SCALE
LABEL_H = 22


def font() -> ImageFont.ImageFont:
    for name in ("consola.ttf", "DejaVuSansMono.ttf", "Menlo.ttc"):
        try:
            return ImageFont.truetype(name, 15)
        except OSError:
            continue
    return ImageFont.load_default()


def cells_of(path: Path, count: int) -> tuple[list[Image.Image], int]:
    raw = path.read_bytes()
    w, h = struct.unpack_from("<II", raw, 0)
    size = w * h * 3
    pictures = [Image.frombytes("RGB", (w, h), raw[8 + i * size : 8 + (i + 1) * size]) for i in range(count)]
    return pictures, h


def build(clip_dir: Path, out: Path) -> None:
    meta = json.loads((clip_dir / "meta.json").read_text())
    labels: list[str] = meta["labels"]
    columns: int = meta["columns"]
    rows = (len(labels) + columns - 1) // columns
    f = font()
    frames: list[Image.Image] = []
    for path in sorted(clip_dir.glob("*.bin")):
        pictures, h = cells_of(path, len(labels))
        cell_w = 22 * SCALE + PAD * 2
        cell_h = h * SCALE + PAD + LABEL_H
        sheet = Image.new("RGB", (cell_w * columns, cell_h * rows + PAD), BG)
        draw = ImageDraw.Draw(sheet)
        for i, (picture, label) in enumerate(zip(pictures, labels)):
            x = (i % columns) * cell_w + PAD
            y = (i // columns) * cell_h + PAD
            sheet.paste(picture.resize((22 * SCALE, h * SCALE), Image.NEAREST), (x, y))
            tw = draw.textlength(label, font=f)
            draw.text((x + (22 * SCALE - tw) / 2, y + h * SCALE + 2), label, fill=LABEL, font=f)
        frames.append(sheet.convert("P", palette=Image.ADAPTIVE, colors=255))
    out.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=meta["ms"], loop=0, optimize=True, disposal=1)
    print(f"{out.name}: {len(frames)} frames, {out.stat().st_size // 1024} KiB")


def main() -> None:
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    for clip_dir in sorted(p for p in src.iterdir() if p.is_dir()):
        build(clip_dir, dst / f"{clip_dir.name}.gif")


if __name__ == "__main__":
    main()
