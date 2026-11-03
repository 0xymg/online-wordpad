#!/usr/bin/env python3
"""Inspect A7.3 genuine Word font resources and explicit-line baseline pitches.

PDF text-layer geometry and native font-table evidence are reported separately;
this deliberately makes no claim about raster equality or font availability.
"""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path

import pdfplumber
from pypdf import PdfReader
from fontTools.ttLib import TTFont


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metric(font):
    h = font['hhea']
    result = {'units_per_em': font['head'].unitsPerEm, 'hhea_ascent': h.ascent,
              'hhea_descent': h.descent, 'hhea_line_gap': h.lineGap,
              'hhea_single': (h.ascent-h.descent+h.lineGap)/font['head'].unitsPerEm}
    if 'OS/2' not in font:
        return {**result, 'os2_status': 'ABSENT_IN_EMBEDDED_SUBSET'}
    o = font['OS/2']
    return {**result, 'typo_ascent': o.sTypoAscender, 'typo_descent': o.sTypoDescender,
            'typo_line_gap': o.sTypoLineGap, 'win_ascent': o.usWinAscent,
            'win_descent': o.usWinDescent}


def inspect(path, markers):
    resources = []
    reader = PdfReader(path)
    for pi, page in enumerate(reader.pages):
        fonts = []
        seen = set()
        for ref in page.get('/Resources', {}).get('/Font', {}).values():
            f = ref.get_object()
            d = f['/DescendantFonts'][0].get_object() if '/DescendantFonts' in f else f
            descriptor = d.get('/FontDescriptor', {})
            descriptor = descriptor.get_object() if hasattr(descriptor, 'get_object') else descriptor
            name = str(f.get('/BaseFont'))
            if name in seen:
                continue
            seen.add(name)
            row = {'base_font': name, 'ascent': descriptor.get('/Ascent'),
                   'descent': descriptor.get('/Descent'), 'cap_height': descriptor.get('/CapHeight'),
                   'font_bbox': descriptor.get('/FontBBox')}
            binary = descriptor.get('/FontFile2')
            if binary:
                data = binary.get_object().get_data()
                row['embedded_font_sha256'] = hashlib.sha256(data).hexdigest()
                row['metrics'] = metric(TTFont(io.BytesIO(data)))
            fonts.append(row)
        resources.append({'page': pi+1, 'fonts': fonts})
    paragraphs = []
    with pdfplumber.open(path) as pdf:
        for m in markers:
            lines = []
            for i in range(1, m['line_count']+1):
                token = f"{m['id']}_L{i}"
                found = []
                for pi, page in enumerate(pdf.pages):
                    for hit in page.search(re.escape(token), regex=True):
                        chars = hit['chars']
                        # Font metrics affect text bounds. The text matrix's f
                        # coordinate gives the independent baseline directly.
                        found.append({'page': pi+1, 'top_pt': hit['top'],
                                      'x_pt': hit['x0'], 'font': chars[0]['fontname'],
                                      'size_pt': chars[0]['size'],
                                      'baseline_from_bottom_pt': chars[0]['matrix'][5]})
                lines.append({'token': token, 'matches': found})
            complete = all(len(x['matches']) == 1 for x in lines)
            pitches = []
            if complete:
                for a, b in zip(lines, lines[1:]):
                    a, b = a['matches'][0], b['matches'][0]
                    if a['page'] == b['page']:
                        pitches.append(a['baseline_from_bottom_pt']-b['baseline_from_bottom_pt'])
            paragraphs.append({**m, 'lines': lines, 'exactly_once': complete,
                               'baseline_pitches_pt': pitches,
                               'mean_baseline_pitch_pt': sum(pitches)/len(pitches) if pitches else None})
    return {'path': str(path), 'sha256': sha(path), 'page_count': len(reader.pages),
            'font_resources': resources, 'paragraphs': paragraphs}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory', type=Path, default=Path('fixtures/compatibility/a7-3-fonts'))
    p.add_argument('--app', type=Path)
    p.add_argument('--output', type=Path)
    args = p.parse_args()
    manifest = json.loads((args.directory/'manifest.json').read_text())
    source = args.directory/manifest['source']
    if sha(source) != manifest['source_sha256']:
        raise SystemExit('Source hash differs from the frozen probe manifest')
    word = args.directory/'metrics-probe.word.pdf'
    out = {'schema_version': 1, 'source_sha256': sha(source),
           'reference_application': manifest['reference_application'],
           'reference_capture_status': manifest.get('reference_status', 'PENDING'),
           'word': inspect(word, manifest['markers']) if word.exists() else {'status': 'PENDING'},
           'prior_word_font_resources': [inspect(Path(name), []) for name in
                                        ['fixtures/compatibility/references/columns.pdf',
                                         'fixtures/section-editor/ui-smoke.word.pdf']],
           'limits': ['Font resources prove the embedded fonts, not CSS fallback selection.',
                      'Text-layer baseline geometry is independent of glyph raster equality.',
                      'The prior Calibri reference contains single lines and does not establish automatic line pitch.',
                      'Roboto is supported only if genuine Word resources establish the requested face.']}
    local = [Path('/System/Library/Fonts/Supplemental')/name for name in
             ['Arial.ttf', 'Arial Bold.ttf', 'Arial Italic.ttf', 'Arial Bold Italic.ttf',
              'Times New Roman.ttf', 'Times New Roman Bold.ttf', 'Times New Roman Italic.ttf',
              'Times New Roman Bold Italic.ttf', 'Courier New.ttf']]
    local += list(Path('public/pdf-fonts').glob('*.ttf'))
    out['local_font_binaries'] = [{'path': str(f), 'sha256': sha(f), 'metrics': metric(TTFont(f))}
                                  for f in local if f.exists()]
    if args.app:
        out['app'] = inspect(args.app, manifest['markers'])
    if 'paragraphs' in out['word']:
        pitches = []
        for paragraph in out['word']['paragraphs']:
            match = paragraph['lines'][0]['matches']
            face = next((face for page in out['word']['font_resources'] for face in page['fonts']
                         if match and face['base_font'] == '/'+match[0]['font']), None)
            if not face or 'metrics' not in face:
                continue
            m = face['metrics']
            single = max(m['hhea_single'], (m['win_ascent']+m['win_descent'])/m['units_per_em'])
            expected = paragraph['size_pt']*paragraph['word_auto_multiple']*single
            row = {'id': paragraph['id'], 'requested_family': paragraph['font'],
                   'actual_word_face': face['base_font'], 'word_single_metric': single,
                   'expected_mean_pitch_pt': expected,
                   'word_mean_pitch_pt': paragraph['mean_baseline_pitch_pt'],
                   'word_mean_minus_metric_pt': paragraph['mean_baseline_pitch_pt']-expected,
                   'word_mean_within_0_1_pt_metric': abs(paragraph['mean_baseline_pitch_pt']-expected) <= .1}
            if args.app:
                app = next(p for p in out['app']['paragraphs'] if p['id'] == paragraph['id'])
                row.update(app_mean_pitch_pt=app['mean_baseline_pitch_pt'],
                           app_mean_minus_word_pt=app['mean_baseline_pitch_pt']-paragraph['mean_baseline_pitch_pt'],
                           app_mean_within_0_1_pt_word=abs(app['mean_baseline_pitch_pt']-paragraph['mean_baseline_pitch_pt']) <= .1)
            pitches.append(row)
        out['captured_uniform_ascii_profiles'] = pitches
    result = args.output or args.directory/'font-metrics-evidence.json'
    result.write_text(json.dumps(out, indent=2)+'\n')
    print(result)


if __name__ == '__main__':
    main()
