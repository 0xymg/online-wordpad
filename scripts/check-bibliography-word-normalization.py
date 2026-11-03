"""Audit the real Word save without mistaking equal text for equal formatting.

This is a fixture evidence check, not an import acceptance check. Run the native
adapter and editor checks separately to verify rejection preserves the open doc.
"""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures/bibliography"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}


def read(name):
    with ZipFile(FIXTURES / name) as package:
        document = ET.fromstring(package.read("word/document.xml"))
        metadata = json.loads(ET.fromstring(package.read("customXml/itemBibliography.xml")).text)
        styles = ET.fromstring(package.read("word/styles.xml"))
    return document, metadata, styles


def citation_runs(document, field_id):
    for paragraph in document.findall(".//w:p", NS):
        active = False
        result = []
        endpoint = None
        for child in paragraph:
            if child.tag == f"{{{W}}}bookmarkStart" and child.get(f"{{{W}}}name") == "EDBC" + field_id[4:]:
                assert not active, "duplicate carrier"
                active = True
                endpoint = child.get(f"{{{W}}}id")
            elif child.tag == f"{{{W}}}bookmarkEnd" and active and child.get(f"{{{W}}}id") == endpoint:
                return result
            elif active:
                assert child.tag == f"{{{W}}}r", "unexpected carrier node"
                text = "".join(t.text or "" for t in child.findall("w:t", NS))
                rtl = child.find("w:rPr/w:rtl", NS)
                value = None if rtl is None else rtl.get(f"{{{W}}}val", "true")
                result.append((text, value))
    raise AssertionError("missing citation carrier")


original, metadata, original_styles = read("formatted-copy-customxml.docx")
saved, saved_metadata, saved_styles = read("word-online-edited.docx")
assert metadata == saved_metadata, "Word retained exact source graph, IDs, config and cached signatures"
assert list(metadata["graph"]["sources"]) == ["src_5022cfcc26664c8588b09a9f8890ddb0"]
assert metadata["graph"]["bibliography"] == {"style": "apa7", "locale": "en-US", "includeUncited": False}
field_id = "fld_0bb42f4ae44743868116f0d49d06ffa2"
before = citation_runs(original, field_id)
after = citation_runs(saved, field_id)
assert "".join(text for text, _ in before) == "".join(text for text, _ in after)
assert len(before) == 1 and len(after) == 7
assert before[0][1] is None
assert [(text, rtl) for text, rtl in after if rtl is not None] == [(", ", "1"), (", ", "1"), (". ", "1")]
# No original style/default supplies rtl=true; absence cannot be equated with
# newly explicit rtl=true. XML 1 and true are the same OOXML boolean.
assert not original_styles.findall(".//w:rtl", NS)
assert not saved_styles.findall(".//w:rtl", NS)
assert "BIB_START WORD_EDIT" in "".join(saved.itertext())
provenance = json.loads((FIXTURES / "provenance.json").read_text())
assert hashlib.sha256((FIXTURES / "word-online-edited.docx").read_bytes()).hexdigest() == provenance["wordOnlineEdited"]["fixtureSha256"]
print("PASS real Word fixture: exact metadata/IDs/config and citation text retained; seven runs include three newly explicit rtl=true punctuation runs. Semantic direction equivalence is unproven; source restoration must remain rejected.")
