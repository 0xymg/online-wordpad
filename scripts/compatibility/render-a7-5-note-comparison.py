#!/usr/bin/env python3
"""Render actual 12pt PDF crops at 4 pixels/point without moving their ink."""
import sys
sys.dont_write_bytecode=True
import argparse,json,hashlib
from pathlib import Path
import pdfplumber,pypdfium2 as pdfium
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--after',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2]/'fixtures/compatibility'
paths=[root/'a7-4-note-metric-probes/base-12.word.pdf',root/'a7-5-note-probes/baseline-metric/base-12.pdf',a.after]
with pdfplumber.open(paths[0]) as pdf:rules=sorted([r for r in pdf.pages[0].rects if 140<r['width']<148 and .1<r['height']<1.5],key=lambda r:r['top'])
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',28)
small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',22)
width,height=808,176; left=120; gap=24; top=100; rowheight=230
canvas=Image.new('RGB',(left+3*(width+gap),top+2*rowheight+40),'#f3f5f8');draw=ImageDraw.Draw(canvas)
draw.text((left,18),'12 pt - Gerçek PDF görüntüleri (4 piksel/pt)',font=font,fill='#152139')
for i,(label,path) in enumerate(zip(['Word','Önce','Sonra'],paths)):
 with pdfium.PdfDocument(path) as pdf:im=pdf[0].render(scale=4).to_pil().convert('RGB')
 x=left+i*(width+gap);draw.text((x,60),label,font=font,fill='#152139')
 for j,(story,r) in enumerate(zip(['Sonnot','Dipnot'],rules)):
  y=top+j*rowheight
  cropbox=(88*4,int((r['top']-6)*4),290*4,int((r['top']-6)*4)+height)
  canvas.paste(im.crop(cropbox),(x,y));draw.rectangle((x-1,y-1,x+width,y+height),outline='#ccd3dd')
  if i==0:draw.text((10,y+60),story,font=small,fill='#152139')
  draw.text((x,y+height+9),'Aynı sayfa koordinatlarından kırpıldı.',font=small,fill='#44536a')
a.output.parent.mkdir(parents=True,exist_ok=True);canvas.save(a.output)
a.output.with_suffix('.provenance.json').write_text(json.dumps({'scale_pixels_per_pt':4,'method':'Identical Word-based crop coordinates for each actual PDF; no ink repositioning or resizing','sources':[{'pdf':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths]},indent=2)+'\n')
