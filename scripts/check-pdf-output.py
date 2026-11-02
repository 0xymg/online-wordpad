"""Validate PDF and native-print artifacts from check-pdf-print.cjs (pypdf)."""
import sys
import re
from pathlib import Path
from pypdf import PdfReader
root = Path(sys.argv[1])
headers = ['FIRST HEADER', 'EVEN HEADER', 'NORMAL HEADER', 'NORMAL HEADER', 'EVEN HEADER']
footers = ['FIRST FOOTER 1 / 5', 'EVEN FOOTER 2 / 5', 'NORMAL FOOTER 3 / 5', 'SECTION TWO 7 / 5', 'SECTION TWO EVEN 8 / 5']
for name in ('export.pdf', 'print.pdf', 'edited.pdf', 'credits.pdf'):
    reader = PdfReader(root / name)
    assert len(reader.pages) == 5, (name, len(reader.pages))
    for index, page in enumerate(reader.pages):
        text = ' '.join(page.extract_text().split())
        expected_footer = 'EDITED PDF FOOTER 7 / 5' if name in ('edited.pdf', 'credits.pdf') and index == 3 else footers[index]
        for expected in (headers[index], expected_footer, f'BODY {chr(65 + index)} unique content.'):
            assert expected in text, (name, index + 1, expected, text)
        assert sum(f'BODY {letter} unique content.' in text for letter in 'ABCDE') == 1, (name, index, text)
        width, height = map(float, (page.mediabox.width, page.mediabox.height))
        expected_width, expected_height = (595.3, 841.9) if index < 3 else (792, 612)
        assert abs(width - expected_width) < 0.5 and abs(height - expected_height) < 0.5, (name, index, width, height)
        if name == 'credits.pdf':
            assert 'EDTRpad' in text and 'wordpad.info' in text, (name, index, text)
        assert page.images, (name, index, 'Missing header image')
        # In both engines, the header sits above the body and the footer below it.
        positions = {}
        def visitor(fragment, cm, tm, font, size):
            x, y = tm[4] * cm[0] + tm[5] * cm[2] + cm[4], tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
            for key, needle in [('header', headers[index]), ('body', f'BODY {chr(65 + index)}'), ('footer', re.split(r'\d', expected_footer)[0].strip())]:
                if needle in fragment:
                    positions.setdefault(key, (x, y))
        page.extract_text(visitor_text=visitor)
        if len(positions) == 3:
            assert positions['header'][1] > positions['body'][1] > positions['footer'][1], (name, index, positions)
print('PASS PDF/print: all body text, source/edited headers and footers, live fields, first/even pages, section restart, images and mixed paper geometry.')

for name in ('natural-export.pdf', 'natural-print.pdf'):
    reader = PdfReader(root / name)
    assert len(reader.pages) >= 3, (name, len(reader.pages))
    all_text = ''
    for index, page in enumerate(reader.pages):
        text = ' '.join(page.extract_text().split())
        assert 'NATURAL HEADER' in text, (name, index, text)
        assert f'LONG FOOTER {index + 1} / {len(reader.pages)}' in text, (name, index, text)
        all_text += text + ' '
    for index in range(95):
        assert len(re.findall(rf'LONG ROW {index}\b', all_text)) == 1, (name, index)
        assert len(re.findall(rf'COMPANION {index}\b', all_text)) == 1, (name, index)
    assert 'LONG BODY BEGIN' in all_text and 'LONG BODY END' in all_text, name
print('PASS natural table pagination: every row exactly once, all page fields/totals, repeated rich header and final body text.')
