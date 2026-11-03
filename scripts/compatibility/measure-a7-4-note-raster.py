#!/usr/bin/env python3
"""Measure long horizontal black runs in note probe first pages at 4 px/pt.
This samples dark pixel coverage, not vector geometry or glyph baselines.
"""
from pathlib import Path
import json
import numpy as np
import pypdfium2 as pdfium
root=Path(__file__).resolve().parents[2]/'fixtures/compatibility/a7-4-note-probes'
results=[]
for case in json.loads((root/'manifest.json').read_text())['cases']:
 for kind,file in [('word',root/(case['id']+'.word.pdf')),('app',root/'app-pdfs'/(case['id']+'.pdf'))]:
  if not file.exists(): continue
  with pdfium.PdfDocument(file) as pdf:
   image=np.asarray(pdf[0].render(scale=4).to_pil().convert('L'))
   rows=np.where((image[:,400:800]<128).mean(axis=1)>.8)[0]
   if len(rows):
    starts=rows[np.r_[True,np.diff(rows)>1]]; ends=rows[np.r_[np.diff(rows)>1,True]]
    runs=[{'top_sample_pt':float(a/4),'last_sample_pt':float(b/4)} for a,b in zip(starts,ends)]
   else: runs=[]
  results.append({'id':case['id'],'kind':kind,'page':1,'runs':runs})
(root/'raster-measurements.json').write_text(json.dumps({'schema_version':1,'description':'4 px/pt PDFium raster, threshold <128, over 80% of x=100..200 pt; sampled rows, not vector bounds','results':results},indent=2)+'\n')
