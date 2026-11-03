#!/usr/bin/env python3
"""Synthetic PDF tests for destination resolution; never Word reference evidence."""
import importlib.util
import unittest
from pathlib import Path
from pypdf import PdfWriter, PdfReader
from pypdf.generic import ArrayObject, NameObject, NumberObject, NullObject, DictionaryObject, TextStringObject
from io import BytesIO
spec=importlib.util.spec_from_file_location('report',Path(__file__).with_name('report.py'))
report=importlib.util.module_from_spec(spec); spec.loader.exec_module(report)

class DestinationTests(unittest.TestCase):
    def setUp(self):
        writer=PdfWriter(); writer.add_blank_page(width=612,height=792); writer.add_blank_page(width=612,height=792)
        writer.add_named_destination('chapter',1)
        buffer=BytesIO(); writer.write(buffer); buffer.seek(0); self.reader=PdfReader(buffer)
    def test_direct_and_named_destinations(self):
        target=ArrayObject([self.reader.pages[1].indirect_reference,NameObject('/XYZ'),NumberObject(72),NumberObject(700),NullObject()])
        value=report.resolve_link(self.reader,DictionaryObject({NameObject('/Dest'):target}))
        self.assertEqual(value,{'kind':'GoTo','page':2,'fit':'/XYZ','coordinates':[72.,700.,None]})
        named=report.resolve_link(self.reader,DictionaryObject({NameObject('/Dest'):TextStringObject('chapter')}))
        self.assertEqual(named['page'],2)
    def test_equal_count_wrong_target_fails(self):
        a={'kind':'GoTo','page':1,'fit':'/XYZ','coordinates':[72.,700.,None]}
        b={**a,'page':2}
        self.assertFalse(report.compare_link_targets([a],[b]))
        self.assertFalse(report.compare_link_targets([a],[{**a,'coordinates':[72.,698.,None]}]))
        self.assertTrue(report.compare_link_targets([a],[{**a,'coordinates':[72.,700.5,None]}]))
    def test_unknown_does_not_pass(self):
        self.assertIsNone(report.compare_link_targets([{'kind':'UNRESOLVED'}],[{'kind':'UNRESOLVED'}]))
        self.assertFalse(report.compare_link_targets([{'kind':'URI','uri':'https://a.test'}],[{'kind':'URI','uri':'https://b.test'}]))
if __name__=='__main__': unittest.main()
