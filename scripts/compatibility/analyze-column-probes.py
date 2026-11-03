#!/usr/bin/env python3
"""Archive genuine Word downloads and measure A3 source markers, not app fidelity."""
from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
import argparse, json, math, re, shutil, zipfile
from xml.etree import ElementTree as ET
import pdfplumber
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'fixtures' / 'columns'
REFS = BASE / 'references'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
digest = lambda path: sha256(path.read_bytes()).hexdigest()
rounded = lambda value: round(float(value), 3)

def expected_markers(item):
    result = set(item['source_facts']['markers_once'])
    for family in item['source_facts']['marker_families']:
        result.update(f"{family['prefix']}{index:0{family['digits']}d}" for index in range(family['count']))
    return result

def source_info(item):
    path = BASE / item['source']
    if digest(path) != item['source_sha256']:
        raise ValueError(f"Source changed after generation: {path}")
    with zipfile.ZipFile(path) as package:
        body = ET.fromstring(package.read('word/document.xml')).find(W + 'body')
        markers, source_section = expected_markers(item), 0
        sections = {}
        # Search exact synthetic strings in source paragraphs; paragraph terminal
        # sectPr belongs to the section being closed, not the following one.
        for block in body:
            text = ''.join(node.text or '' for node in block.iter(W + 't'))
            for marker in markers:
                if marker in text:
                    sections[marker] = source_section
            if block.tag == W + 'p' and block.find(W + 'pPr/' + W + 'sectPr') is not None:
                source_section += 1
        flags = []
        for name in package.namelist():
            if not name.startswith('word/') or not name.endswith('.xml'):
                continue
            for node in ET.fromstring(package.read(name)).iter():
                if 'balance' in node.tag.lower() or any('balance' in value.lower() for value in node.attrib.values()):
                    flags.append({'part': name, 'tag': node.tag, 'attributes': node.attrib})
        settings = ET.fromstring(package.read('word/settings.xml'))
        compatibility = [node.attrib for node in settings.iter(W + 'compatSetting')]
    return sections, flags, compatibility

def archive(item, download, note):
    source_info(item)
    target = REFS / (item['id'] + '.word.pdf')
    if target.exists() and digest(target) != digest(download):
        raise ValueError(f"A different captured reference already exists: {target}")
    if download.resolve() != target.resolve():
        shutil.copy2(download, target)
    provenance = {
        'reference_application': 'Microsoft Word Online',
        'source_sha256': item['source_sha256'], 'pdf_sha256': digest(target),
        'captured_at_utc': datetime.fromtimestamp(download.stat().st_mtime, timezone.utc).isoformat(),
        'capture_timestamp_basis': 'downloaded file mtime in UTC; exact export event time unavailable',
        'method': 'Root opened the exact source and used Word Online File > Export > Download as PDF',
        'browser': 'Codex in-app browser; exact engine version unavailable',
        'word_build': 'not exposed',
        'paper': 'Source Letter portrait 12240x15840 twips, four 1440-twip margins; PDF media boxes measured in report',
        'font_specification': 'Arial 11pt in source script slots; actual substitution not independently verified',
        'original_download_filename': download.name,
    }
    if note:
        provenance['capture_notes'] = note
    (REFS / (item['id'] + '.provenance.json')).write_text(json.dumps(provenance, indent=2) + '\n')

def analyze(item):
    section_for_marker, balance_flags, compatibility = source_info(item)
    target = REFS / (item['id'] + '.word.pdf')
    provenance_path = REFS / (item['id'] + '.provenance.json')
    if not target.exists() or not provenance_path.exists():
        return {'id': item['id'], 'status': 'PENDING', 'reason': 'Genuine Word PDF or provenance is absent'}
    provenance = json.loads(provenance_path.read_text())
    if provenance['source_sha256'] != item['source_sha256'] or provenance['pdf_sha256'] != digest(target):
        raise ValueError(f"Reference/provenance hash mismatch: {item['id']}")
    markers = expected_markers(item)
    pattern = re.compile('|'.join(re.escape(marker) for marker in sorted(markers, key=lambda value: (-len(value), value))))
    found, pages = {marker: [] for marker in markers}, []
    with pdfplumber.open(target) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            # Content-stream order permits exact Latin-marker recovery even if
            # a long marker crosses a visual line or bidi word extraction differs.
            text, offsets = '', []
            for index, char in enumerate(page.chars):
                value = char.get('text', '')
                text += value
                offsets.extend([index] * len(value))
            page_markers = []
            for match in pattern.finditer(text):
                selected = [page.chars[index] for index in sorted(set(offsets[match.start():match.end()]))]
                if not selected:
                    continue
                marker, source_section = match.group(), section_for_marker[match.group()]
                config = item['source_facts']['sections'][source_section]
                columns = config['columns'] or {'num': 1, 'space': 0}
                left = item['source_facts']['margins_twips']['left'] / 20
                right = item['source_facts']['margins_twips']['right'] / 20
                available = item['source_facts']['page_twips']['width'] / 20 - left - right
                width = (available - (columns['num'] - 1) * columns['space'] / 20) / columns['num']
                x0 = min(char['x0'] for char in selected)
                physical_column = min(columns['num'] - 1, max(0, math.floor((x0 - left + .5) / (width + columns['space'] / 20))))
                baselines = [rounded(page.height - char['matrix'][5]) for char in selected if char.get('matrix') and char.get('upright')]
                record = {'marker': marker, 'page': page_number, 'source_section_index': source_section,
                    'physical_column_from_left': physical_column,
                    'x0_pt': rounded(x0), 'x1_pt': rounded(max(char['x1'] for char in selected)),
                    'top_pt': rounded(min(char['top'] for char in selected)), 'bottom_pt': rounded(max(char['bottom'] for char in selected)),
                    'baseline_top_pt': baselines[0] if len(set(baselines)) == 1 else None,
                    'baseline_tops_pt': sorted(set(baselines)),
                    'baseline_count': len(set(baselines))}
                found[marker].append(record); page_markers.append(record)
            separators = []
            for shape in page.rects + page.lines:
                if shape['width'] <= 2 and shape['height'] >= 10:
                    separators.append({'kind': shape['object_type'], **{name + '_pt': rounded(shape[name]) for name in ['x0', 'x1', 'top', 'bottom']}})
            pages.append({'page': page_number, 'width_pt': rounded(page.width), 'height_pt': rounded(page.height),
                'text_characters': len(page.chars), 'has_extractable_text': bool(page.chars),
                'font_names_in_pdf': sorted(set(char['fontname'] for char in page.chars)),
                'vertical_separator_shapes': separators, 'markers': page_markers})
    families = []
    for family in item['source_facts']['marker_families']:
        runs = []
        for index in range(family['count']):
            marker = f"{family['prefix']}{index:0{family['digits']}d}"
            if len(found[marker]) != 1:
                continue
            record = found[marker][0]
            key = (record['page'], record['physical_column_from_left'])
            if not runs or tuple(runs[-1]['region']) != key:
                runs.append({'region': list(key), 'first_marker': marker, 'last_marker': marker, 'count': 0})
            runs[-1]['last_marker'] = marker; runs[-1]['count'] += 1
        families.append({**family, 'measured_source_order_runs': runs})
    return {'id': item['id'], 'status': 'WORD_REFERENCE_MEASURED', 'source_sha256': item['source_sha256'],
        'pdf_sha256': digest(target), 'provenance': provenance_path.name, 'page_count': len(pages),
        'source_balance_related_flags': balance_flags, 'source_compatibility_settings': compatibility,
        'expected_marker_count': len(markers), 'missing_markers': sorted(marker for marker in markers if not found[marker]),
        'duplicate_markers': {marker: len(records) for marker, records in found.items() if len(records) > 1},
        'marker_coordinates': found, 'marker_family_runs': families, 'pages': pages,
        'app_comparison': 'NOT_PERFORMED', 'caret_and_editability': 'NOT_ASSESSED',
        'measurement_scope': 'PDF text matrices/character boxes and visible vector shapes; not a whole-page fidelity score'}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', nargs=2, action='append', default=[], metavar=('PROBE_ID', 'DOWNLOADED_PDF'))
    parser.add_argument('--note', default='')
    args = parser.parse_args()
    manifest_path = BASE / 'manifest.json'; manifest = json.loads(manifest_path.read_text())
    items = {item['id']: item for item in manifest['fixtures']}
    REFS.mkdir(exist_ok=True)
    for probe_id, filename in args.archive:
        archive(items[probe_id], Path(filename), args.note)
    report = {'schema_version': 1, 'status_meaning': 'Word reference measurement only; no EDTR comparison/pass claim',
        'fixtures': [analyze(item) for item in manifest['fixtures']]}
    (REFS / 'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    for result in report['fixtures']:
        if result['status'] == 'WORD_REFERENCE_MEASURED':
            provenance = json.loads((REFS / (result['id'] + '.provenance.json')).read_text())
            items[result['id']]['word_reference'] = {'status': 'CAPTURED', 'pdf': 'references/' + result['id'] + '.word.pdf',
                'provenance': 'references/' + result['id'] + '.provenance.json', 'source_sha256': result['source_sha256'],
                'pdf_sha256': result['pdf_sha256'], 'captured_at_utc': provenance['captured_at_utc'],
                'page_count': result['page_count'], 'measurements': 'references/report.json', 'app_comparison': 'NOT_PERFORMED'}
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    for result in report['fixtures']:
        print(result['id'], result['status'], f"pages={result.get('page_count')}", f"missing={len(result.get('missing_markers', []))}", f"duplicate={len(result.get('duplicate_markers', {}))}")

if __name__ == '__main__':
    main()
