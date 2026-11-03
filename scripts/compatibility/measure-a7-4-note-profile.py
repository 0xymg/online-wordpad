#!/usr/bin/env python3
"""Measure Word vector rectangles and PDFium raster rule coverage at 4 px/pt."""
from pathlib import Path
import json,hashlib
import pdfplumber,pypdfium2 as pdfium
import numpy as np
root=Path(__file__).resolve().parents[2]/'fixtures/compatibility'
items=[('a7-4-note-probes','base-11'),('a7-4-note-probes','base-16'),('a7-4-note-probes','columns-base-11'),('a7-4-note-metric-probes','base-12'),('a7-4-note-metric-probes','base-20')]
rows=[]
for directory,name in items:
 folder=root/directory; word=folder/(name+'.word.pdf'); app=folder/'app-pdfs'/(name+'.pdf')
 with pdfplumber.open(word) as doc:
  page=doc.pages[0]; rects=sorted((r for r in page.rects if 140<r['width']<148 and 0.1<r['height']<1.5),key=lambda r:r['top'])
  if len(rects)!=2: raise ValueError(f'{name}: expected two Word rule rectangles')
 for kind,path in [('word',word),('app',app)]:
  with pdfium.PdfDocument(path) as pdf: pixels=np.asarray(pdf[0].render(scale=4).to_pil().convert('L'),dtype=float)
  samples=[]
  for label,r in zip(['endnote','footnote'],rects):
   y=np.arange(int((r['top']-2)*4),int((r['top']+2)*4)); ink=(255-pixels[y,400:800]).mean(axis=1)/255; m=ink>.02
   samples.append({'story':label,'word_vector_top_pt':r['top'],'word_vector_height_pt':r['height'],'raster_ink_centroid_pt':float(((y[m]/4+.125)*ink[m]).sum()/ink[m].sum()),'raster_ink_coverage_pt':float(ink[m].sum()/4)})
  rows.append({'id':name,'kind':kind,'pdf_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rules':samples})
(root/'a7-4-note-profile-measurements.json').write_text(json.dumps({'schema_version':1,'method':'PDFium 4px/pt, intensity-weighted centroid across x=100..200pt within 2pt of Word vector rule; coverage includes rasterization','results':rows},indent=2)+'\n')
