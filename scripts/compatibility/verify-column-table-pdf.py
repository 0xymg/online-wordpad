"""Verify long-cell text in physical reading lanes, avoiding row-wise cell interleaving."""
from collections import Counter
import json
import re
import sys
import pdfplumber

left_lanes = []
right_lanes = []
with pdfplumber.open(sys.argv[1]) as pdf:
    for page in pdf.pages:
        for start in (72, 324):
            def lane(lo, hi):
                chars = [c for c in page.chars if lo <= (c['x0'] + c['x1']) / 2 < hi]
                chars.sort(key=lambda c: (round(c['top'], 1), c['x0']))
                return ''.join(c['text'] for c in chars)
            left_lanes.append(lane(start - 2, start + 75))
            right_lanes.append(lane(start + 75, start + 154))
left = re.sub(r'\s+', '', ''.join(left_lanes))
right = re.sub(r'\s+', '', ''.join(right_lanes))
expected_count = int(sys.argv[2]) if len(sys.argv) > 2 else 40
checks = {'start': left.count('CELL_LONG_START'), 'end': left.count('CELL_LONG_END'), 'alpha': left.count('alpha'), 'bravo': left.count('bravo'), 'short': right.count('SHORT_CELL')}
print(json.dumps({'checks': checks, 'left_lanes': left_lanes, 'right_lanes': right_lanes}))
if checks != {'start': 1, 'end': 1, 'alpha': expected_count, 'bravo': expected_count, 'short': 1}:
    raise SystemExit('PDF table markers or token counts do not match the source')
