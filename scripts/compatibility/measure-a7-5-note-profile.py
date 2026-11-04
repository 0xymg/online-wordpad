#!/usr/bin/env python3
"""Compare frozen Word rules with fresh application PDFs without changing A7.4 evidence.

Repeat --app-dir/--baseline-dir when captures are split between fixture groups.
Rule gates use the original PDFium 4 px/pt intensity-weighted method. Body
stability compares every pixel outside bounded rule rectangles.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import pdfplumber
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[2]
CASES = [('a7-4-note-probes', 'base-11'), ('a7-4-note-probes', 'columns-base-11'),
         ('a7-4-note-metric-probes', 'base-12'), ('a7-4-note-probes', 'base-16'),
         ('a7-4-note-metric-probes', 'base-20')]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def locate(directories, name):
    found = [Path(d) / (name + '.pdf') for d in directories if (Path(d) / (name + '.pdf')).exists()]
    if len(found) != 1:
        raise ValueError(f'{name}: expected exactly one PDF across supplied directories, found {found}')
    return found[0]

def verify_source_and_word(source, word):
    manifest = json.loads((source.parent/'manifest.json').read_text())
    case = next(c for c in manifest['cases'] if c['source'] == source.name)
    provenance = json.loads(source.with_suffix('.provenance.json').read_text())
    if case['sha256'] != digest(source) or provenance['source_sha256'] != digest(source):
        raise ValueError(f'{source}: source provenance hash mismatch')
    if provenance['pdf_sha256'] != digest(word):
        raise ValueError(f'{word}: Word provenance hash mismatch')
    return {'source_manifest_verified':True, 'word_provenance_verified':True}

def verify_export(source, pdf):
    report = json.loads((pdf.parent/'exports.json').read_text())
    record = next(r for r in report['results'] if r['id'] == source.stem)
    if not report.get('complete') or record['status'] != 'EXPORTED':
        raise ValueError(f'{pdf}: incomplete export provenance')
    if record['source_sha256'] != digest(source) or record['pdf_sha256'] != digest(pdf):
        raise ValueError(f'{pdf}: export provenance hash mismatch')
    if not report.get('application_revision'):
        raise ValueError(f'{pdf}: missing application revision')
    return {'application_revision':report['application_revision'], 'export_hashes_verified':True,
            'base_url':report['base_url'], 'captured_at':record['captured_at']}

def render(path):
    with pdfium.PdfDocument(path) as pdf:
        return [np.asarray(page.render(scale=4).to_pil().convert('L'), dtype=float) for page in pdf]

def measure(pixels, rect):
    y = np.arange(int((rect['top']-2)*4), int((rect['top']+2)*4))
    ink = (255-pixels[y, 400:800]).mean(axis=1)/255
    mask = ink > .02
    if not mask.any():
        raise ValueError('No rule ink in fixed Word comparison window')
    return {'centroid_pt': float(((y[mask]/4+.125)*ink[mask]).sum()/ink[mask].sum()),
            'coverage_pt': float(ink[mask].sum()/4)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app-dir', action='append', required=True)
    parser.add_argument('--baseline-dir', action='append', default=[])
    parser.add_argument('--probe-dir', action='append', default=[], help='Additional fixture directories with manifests and captured Word PDFs')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--revision', required=True, help='Exact application revision plus description of working changes')
    args = parser.parse_args()
    rows = []
    sources = [ROOT/'fixtures/compatibility'/directory/(name+'.docx') for directory,name in CASES]
    for folder in args.probe_dir:
        folder = Path(folder)
        manifest = json.loads((folder/'manifest.json').read_text())
        sources.extend(folder/case['source'] for case in manifest['cases'])
    for source in sources:
        name = source.stem
        word = source.with_suffix('.word.pdf')
        app = locate(args.app_dir, name)
        verification = verify_source_and_word(source, word)
        verification['application_export'] = verify_export(source, app)
        with pdfplumber.open(word) as doc:
            rects = sorted((r for r in doc.pages[0].rects if 140 < r['width'] < 148 and .1 < r['height'] < 1.5), key=lambda r:r['top'])
        if len(rects) != 2:
            raise ValueError(f'{name}: expected two Word rule rectangles')
        wp, ap = render(word), render(app)
        row = {'id': name, 'source_sha256': digest(source), 'word_pdf_sha256': digest(word),
               'verification':verification, 'app_pdf': str(app.resolve()), 'app_pdf_sha256': digest(app), 'page_count': len(ap), 'rules': []}
        for story, rect in zip(['endnote', 'footnote'], rects):
            wm, am = measure(wp[0], rect), measure(ap[0], rect)
            delta = am['centroid_pt']-wm['centroid_pt']
            row['rules'].append({'story': story, 'word_vector_top_pt': rect['top'],
                                 'word_vector_height_pt': rect['height'], 'word': wm, 'app': am,
                                 'centroid_delta_pt': delta, 'within_0_75pt': abs(delta) <= .75})
        if args.baseline_dir:
            baseline = locate(args.baseline_dir, name)
            baseline_verification = verify_export(source, baseline)
            bp = render(baseline)
            stable = len(bp) == len(ap) and all(a.shape == b.shape for a,b in zip(ap,bp))
            changed = 0
            if stable:
                for index, (a,b) in enumerate(zip(ap,bp)):
                    mask = np.ones(a.shape, dtype=bool)
                    if index == 0:
                        # Exclude only the bounded Word rule rectangle (±1pt x, ±3pt y).
                        for rect in rects:
                            mask[max(0,int((rect['top']-3)*4)):int((rect['bottom']+3)*4),
                                 max(0,int((rect['x0']-1)*4)):int((rect['x1']+1)*4)] = False
                    changed += int(np.count_nonzero((a != b) & mask))
            row['baseline'] = {'verification':baseline_verification, 'pdf':str(baseline.resolve()), 'sha256':digest(baseline),
                               'same_page_geometry':stable, 'changed_pixels_outside_rule_rectangles':changed if stable else None,
                               'body_pixels_unchanged':stable and changed == 0}
        rows.append(row)
    report = {'schema_version':2, 'application_revision':args.revision,
              'method':'PDFium 4px/pt; original A7.4 fixed x=100..200pt, ±2pt Word rule window, >2% intensity mask; baseline body comparison excludes only Word vector x0..x1 ±1pt and top..bottom ±3pt rectangles',
              'all_baseline_bodies_unchanged':all(row['baseline']['body_pixels_unchanged'] for row in rows) if args.baseline_dir else None,
              'centroid_threshold_pt':.75, 'all_rules_pass':all(r['within_0_75pt'] for row in rows for r in row['rules']), 'results':rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'all_rules_pass':report['all_rules_pass'], 'rules':[{ 'id':r['id'], 'deltas':[s['centroid_delta_pt'] for s in r['rules']], 'baseline':r.get('baseline')} for r in rows]}, indent=2))

if __name__ == '__main__':
    main()
