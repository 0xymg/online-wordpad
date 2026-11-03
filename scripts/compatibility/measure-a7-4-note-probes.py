#!/usr/bin/env python3
"""Record PDF text bounds and Word's filled rule rectangles, in points from page top.
Text bounds are not visible-ink bounds. Rasterized application rules require separate inspection.
"""
import hashlib, json
from pathlib import Path
import pdfplumber
root=Path(__file__).resolve().parents[2]/'fixtures/compatibility/a7-4-note-probes'
manifest=json.loads((root/'manifest.json').read_text())
rows=[]
for case in manifest['cases']:
    for kind, pdf in [('word',root/(case['id']+'.word.pdf')),('app',root/'app-pdfs'/(case['id']+'.pdf'))]:
        if not pdf.exists(): continue
        pages=[]
        with pdfplumber.open(pdf) as doc:
            for i,page in enumerate(doc.pages):
                rules=[{'x0':r['x0'],'x1':r['x1'],'top':r['top'],'bottom':r['bottom']} for r in page.rects if 140 < r['width'] < 148 and .1 < r['height'] < 1]
                words=[{'text':w['text'],'x0':w['x0'],'top':w['top'],'bottom':w['bottom']} for w in page.extract_words() if any(marker in w['text'] for marker in case['markers'])]
                pages.append({'page':i+1,'rules':rules,'markers':words,'object_types':{k:len(v) for k,v in page.objects.items()}})
        rows.append({'id':case['id'],'kind':kind,'pdf_sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'pages':pages})
(root/'measurements.json').write_text(json.dumps({'schema_version':1,'units':'points','results':rows},indent=2)+'\n')
