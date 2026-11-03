#!/usr/bin/env python3
"""Archive an exact Word Online terminal-control download; no source regeneration."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import shutil
import pdfplumber

ROOT = Path(__file__).resolve().parents[2] / 'fixtures/columns/terminal-controls'
def digest(path):
    return sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('id')
    parser.add_argument('download', type=Path)
    args = parser.parse_args()
    manifest_path = ROOT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    case = next((entry for entry in manifest['cases'] if entry['id'] == args.id), None)
    if case is None:
        raise ValueError('Unknown control')
    source = ROOT / case['source']
    if digest(source) != case['source_sha256']:
        raise ValueError('Source hash does not match manifest')
    data = args.download.read_bytes()
    if not data.startswith(b'%PDF-'):
        raise ValueError('Download is not a PDF')
    destination = ROOT / (args.id + '.word.pdf')
    if destination.exists() and destination.read_bytes() != data:
        raise ValueError('Reference exists with different bytes; refusing overwrite')
    with pdfplumber.open(args.download) as pdf:
        pages = []
        observed = []
        markers = [x for x in case['sequence'] if x not in ('column', 'page')]
        for number, page in enumerate(pdf.pages, 1):
            words = page.extract_words()
            anchors = [{'text': word['text'], 'x0_pt': round(word['x0'], 3), 'top_pt': round(word['top'], 3)} for word in words if word['text'] in markers]
            observed.extend(anchor['text'] for anchor in anchors)
            pages.append({'page': number, 'width_pt': page.width, 'height_pt': page.height, 'extracted_word_count': len(words), 'markers': anchors})
        if sorted(observed) != sorted(markers):
            raise ValueError(f'Marker mismatch: expected {markers!r}, observed {observed!r}')
    if not destination.exists():
        shutil.copyfile(args.download, destination)
    assert destination.read_bytes() == data
    captured = datetime.fromtimestamp(args.download.stat().st_mtime, timezone.utc).isoformat()
    provenance = {'reference_application': 'Microsoft Word Online', 'source_sha256': digest(source), 'pdf_sha256': digest(destination),
      'captured_at_utc': captured, 'capture_timestamp_basis': 'downloaded file mtime in UTC; exact export event time unavailable',
      'method': 'Root opened the exact source and used Word Online File > Export > Download as PDF',
      'browser': 'Codex in-app browser; exact engine version unavailable', 'word_build': 'not exposed',
      'paper': 'Source Letter portrait 12240x15840 twips, four 1440-twip margins',
      'font_specification': 'Arial 11pt declared; actual substitution not independently verified', 'original_download_filename': args.download.name}
    (ROOT / (args.id + '.provenance.json')).write_text(json.dumps(provenance, indent=2) + '\n')
    measurement = {'status': 'WORD_REFERENCE_MEASURED', 'source_sha256': digest(source), 'pdf_sha256': digest(destination), 'page_count': len(pages), 'pages': pages,
       'limits': 'Text extraction alone does not prove a visually blank page or application behavior.'}
    (ROOT / (args.id + '.measurement.json')).write_text(json.dumps(measurement, indent=2) + '\n')
    case['word_reference'] = {'status': 'CAPTURED', 'pdf': destination.name, 'provenance': args.id + '.provenance.json', 'measurement': args.id + '.measurement.json', 'source_sha256': digest(source), 'pdf_sha256': digest(destination), 'captured_at_utc': captured, 'page_count': len(pages)}
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(measurement, indent=2))

if __name__ == '__main__':
    main()
