#!/usr/bin/env python3
"""Compare Word Online and EDTRDocs PDFs without assuming missing evidence passes."""
import argparse, collections, hashlib, json, re
from pathlib import Path
from pypdf import PdfReader
try:
    import pdfplumber
except ImportError:
    pdfplumber=None

ROOT=Path(__file__).resolve().parents[2]
FIXTURES=ROOT/'fixtures/compatibility'

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def display_path(path):
    try: return str(path.resolve().relative_to(ROOT.resolve()))
    except ValueError: return str(path)

def inspect(path):
    reader=PdfReader(str(path)); pages=[]; words=collections.Counter(); full=[]; links=[]
    for number,page in enumerate(reader.pages,1):
        text=page.extract_text() or ''; full.append(text)
        words.update(re.findall(r"[^\W_]+(?:_[^\W_]+)*",text,flags=re.UNICODE))
        b=page.mediabox; page_links=[]
        for annotation in page.get('/Annots',[]):
            obj=annotation.get_object()
            if obj.get('/Subtype')!='/Link': continue
            action=obj.get('/A'); dest=obj.get('/Dest')
            if action: action=action.get_object(); dest=action.get('/URI') or action.get('/D') or action.get('/S')
            page_links.append(str(dest) if dest is not None else '(unresolved)')
        links += page_links
        pages.append({'page':number,'media_box_pt':[float(b.left),float(b.bottom),float(b.right),float(b.top)],'link_count':len(page_links)})
    return {'sha256':digest(path),'page_count':len(pages),'pages':pages,'tokens':words,'text':'\n'.join(full),'link_count':len(links),'link_targets':links}

def anchor_positions(path, tokens):
    """Coordinates from extractable PDF text, not a visual comparison."""
    if pdfplumber is None: return None
    result={token:[] for token in tokens}
    with pdfplumber.open(path) as document:
        for page_number,page in enumerate(document.pages,1):
            for token in tokens:
                for match in page.search(re.escape(token),regex=True):
                    result[token].append({'page':page_number,'x_pt':round(match['x0'],3),'y_pt':round(match['top'],3)})
    return result

def compare_anchors(reference,app,tokens):
    before=anchor_positions(reference,tokens); after=anchor_positions(app,tokens)
    if before is None or after is None: return {'status':'UNAVAILABLE','reason':'pdfplumber not installed'}
    anchors={}
    for token in tokens:
        item={'word':before[token],'app':after[token]}
        if len(before[token])==len(after[token])==1:
            a,b=before[token][0],after[token][0]
            item['same_page']=a['page']==b['page']
            item['delta_css_px']={'x':round((b['x_pt']-a['x_pt'])*4/3,3),'y':round((b['y_pt']-a['y_pt'])*4/3,3)}
        anchors[token]=item
    return {'status':'EXTRACTED_TEXT_ONLY','anchors':anchors}

def compare(fixture,reference,app,profile,app_record,reference_record):
    result={'id':fixture['id'],'source_sha256':fixture['sha256'],'status':'PENDING','visual_status':'NOT_ASSESSED','reference_pdf':display_path(reference),'app_pdf':display_path(app)}
    if app.is_file() and app_record is not None and (app_record.get('source_sha256') != fixture['sha256'] or app_record.get('pdf_sha256') != digest(app) or app_record.get('status') != 'EXPORTED'):
        result.update(status='ERROR',error='Application PDF provenance does not match the source manifest or export record'); return result
    missing=[label for label,path in (('word_reference',reference),('app_pdf',app)) if not path.is_file()]
    if not reference_record and not (profile or {}).get('sources',{}).get(fixture['id']): missing.append('word_reference_provenance')
    if missing: result['pending']=missing; return result
    try: ref=inspect(reference); actual=inspect(app)
    except Exception as exc: result.update(status='ERROR',error=str(exc)); return result
    missing_tokens=ref['tokens']-actual['tokens']; extra_tokens=actual['tokens']-ref['tokens']
    expected=fixture['expected'].get('tokens_once',[])
    counts={token:{'word':ref['text'].count(token),'app':actual['text'].count(token)} for token in expected}
    boxes=[]
    for r,a in zip(ref['pages'],actual['pages']):
        delta=[round(y-x,3) for x,y in zip(r['media_box_pt'],a['media_box_pt'])]
        boxes.append({'page':r['page'],'delta_pt':delta,'within_tolerance':all(abs(v)<=.75 for v in delta)})
    checks={'page_count_equal':ref['page_count']==actual['page_count'],'media_boxes_within_0_75pt':all(row['within_tolerance'] for row in boxes) and ref['page_count']==actual['page_count'],
            'token_multisets_equal':not missing_tokens and not extra_tokens,'expected_markers_once':all(v['word']==1 and v['app']==1 for v in counts.values()),
            'link_count_equal':ref['link_count']==actual['link_count']}
    anchor_comparison=compare_anchors(reference,app,expected)
    if anchor_comparison['status']=='EXTRACTED_TEXT_ONLY':
        entries=anchor_comparison['anchors'].values()
        checks['text_anchors_within_1_css_px'] = all(a.get('same_page') and abs(a.get('delta_css_px',{}).get('x',float('inf'))) <= 1 and abs(a.get('delta_css_px',{}).get('y',float('inf'))) <= 1 for a in entries)
    else: checks['text_anchors_within_1_css_px'] = None
    record=reference_record or (profile or {}).get('sources',{}).get(fixture['id'],{})
    provenance={'source_sha256_matches':record.get('source_sha256')==fixture['sha256'], 'reference_pdf_sha256_matches':(record.get('pdf_sha256') or record.get('reference_pdf_sha256'))==ref['sha256']}
    if reference_record and not all(provenance.values()):
        result.update(status='ERROR',error='Word reference provenance does not match the source manifest or reference PDF',provenance=provenance); return result
    result.update(status='MEASURED' if all(value is not False for value in checks.values()) else 'MISMATCH', checks=checks, provenance=provenance, expected_marker_counts=counts,
                  missing_tokens=dict(sorted(missing_tokens.items())),extra_tokens=dict(sorted(extra_tokens.items())),media_box_deltas=boxes,
                  reference={k:v for k,v in ref.items() if k not in ('text','tokens')},app={k:v for k,v in actual.items() if k not in ('text','tokens')},
                  visual_status='NOT_ASSESSED',text_anchor_positions=anchor_comparison,profile=profile,reference_provenance=record or None)
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--references',type=Path,default=FIXTURES/'references'); parser.add_argument('--app',type=Path,default=FIXTURES/'app-pdfs'); parser.add_argument('--output',type=Path)
    args=parser.parse_args(); manifest=json.loads((FIXTURES/'manifest.json').read_text()); profile_path=args.references/'profile.json'
    profile=json.loads(profile_path.read_text()) if profile_path.exists() else None
    exports_path=args.app/'exports.json'
    exports=json.loads(exports_path.read_text()) if exports_path.exists() else None
    records={r['id']:r for r in exports.get('results',[])} if exports else {}
    cases=[]
    for fixture in manifest['fixtures']:
        path=FIXTURES/fixture['source']; actual=digest(path) if path.exists() else None
        if actual!=fixture['sha256']:
            cases.append({'id':fixture['id'],'status':'ERROR','error':'Source missing or SHA-256 differs from manifest','expected_sha256':fixture['sha256'],'actual_sha256':actual}); continue
        provenance_path=args.references/(fixture['id']+'.provenance.json')
        reference_record=json.loads(provenance_path.read_text()) if provenance_path.exists() else None
        cases.append(compare(fixture,args.references/(fixture['id']+'.pdf'),args.app/(fixture['id']+'.pdf'),profile,records.get(fixture['id'],{}) if exports else None,reference_record))
    required_profile_fields=('reference_application','capture_date','browser_and_version','paper_settings','fonts')
    profile_missing=[key for key in required_profile_fields if not profile or not profile.get(key)]
    output={'schema_version':1,'comparison':'Word Online reference PDF versus EDTRDocs PDF','source_manifest':display_path(FIXTURES/'manifest.json'),
            'reference_profile':profile,'profile_status':'INCOMPLETE' if profile_missing else 'RECORDED','profile_missing':profile_missing,
            'summary':dict(collections.Counter(c['status'] for c in cases)),'cases':cases,
            'limits':['MEASURED covers listed checks only; it does not assert visual fidelity or editing support.', 'Link counts do not prove target equivalence.', 'Token extraction may vary by PDF text encoding.', 'Text anchor coordinates come from extractable PDF text and can differ from visible glyphs; they are not a visual comparison.']}
    text=json.dumps(output,indent=2,ensure_ascii=False)+'\n'
    if args.output: args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_text(text)
    else: print(text,end='')
    return 1 if any(c['status']=='ERROR' for c in cases) else 0
if __name__=='__main__': raise SystemExit(main())
