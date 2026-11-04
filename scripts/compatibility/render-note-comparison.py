"""Render frozen Word / A7.2 / current note artwork, independently of search text.

Run report.py first to validate source/reference/application provenance. These
images are visual evidence, not a raster similarity score or acceptance gate.
"""
import argparse
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--label', default='A7.3 (current capture)')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2] / 'fixtures/compatibility'
    dirs = [root / 'references', root / 'a7-2-app-pdfs', args.app]
    labels = ['Word Online (frozen reference)', 'A7.2 (previous release)', args.label]
    font = ImageFont.load_default(size=20)
    cache = {}

    def page(directory, case, index):
        key = (directory, case, index)
        if key not in cache:
            with pdfium.PdfDocument(directory / f'{case}.pdf') as doc:
                cache[key] = doc[index].render(scale=2).to_pil().convert('RGB')
        return cache[key]

    regions = [('notes', 0, 'Notes: endnote', (80, 110, 540, 185)),
               ('mixed', 1, 'Mixed page 2: endnote', (80, 250, 540, 330)),
               ('notes', 0, 'Notes: footnote', (80, 675, 540, 725)),
               ('mixed', 1, 'Mixed page 2: footnote', (80, 675, 540, 725))]
    width = 920
    row_heights = [int((box[3] - box[1]) * 2) + 38 for _, _, _, box in regions]
    canvas = Image.new('RGB', (width * 3, 44 + sum(row_heights)), '#eeeeee')
    draw = ImageDraw.Draw(canvas)
    for col, label in enumerate(labels):
        draw.text((col * width + 12, 10), label, fill='black', font=font)
    y = 44
    for (case, index, title, box), height in zip(regions, row_heights):
        for col, directory in enumerate(dirs):
            draw.text((col * width + 12, y + 6), title, fill='black', font=font)
            crop = page(directory, case, index).crop(tuple(int(v * 2) for v in box))
            canvas.paste(crop, (col * width, y + 34))
        y += height
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output)
    for case, index in [('notes', 0), ('mixed', 1)]:
        left, right = page(dirs[0], case, index), page(dirs[2], case, index)
        full = Image.new('RGB', (left.width + right.width, max(left.height, right.height) + 38), '#eeeeee')
        full.paste(left, (0, 38)); full.paste(right, (left.width, 38))
        title = ImageDraw.Draw(full)
        title.text((12, 8), labels[0], fill='black', font=font)
        title.text((left.width + 12, 8), labels[2], fill='black', font=font)
        full.save(args.output.with_name(f'{args.output.stem}-{case}-full.png'))
    print(args.output)


if __name__ == '__main__':
    main()
