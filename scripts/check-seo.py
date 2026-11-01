"""Check public SEO/GEO responses: python3 scripts/check-seo.py [base URL]."""

import concurrent.futures
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3107").rstrip("/")
SITE = "https://wordpad.info"
ROOT = Path(__file__).resolve().parents[1]


def fetch(path):
    try:
        response = urllib.request.urlopen(BASE + path, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read().decode("utf-8")


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.h1 = 0
        self.meta = {}
        self.links = []
        self.anchors = []
        self.schemas = []
        self.schema_text = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "h1":
            self.h1 += 1
        elif tag == "meta":
            self.meta[attrs.get("name", attrs.get("property"))] = attrs.get("content", "")
        elif tag == "link":
            self.links.append(attrs)
        elif tag == "a":
            self.anchors.append(attrs.get("href", ""))
        elif tag == "script" and attrs.get("type") == "application/ld+json":
            self.schema_text = ""

    def handle_data(self, text):
        if self.schema_text is not None:
            self.schema_text += text

    def handle_endtag(self, tag):
        if tag == "script" and self.schema_text is not None:
            self.schemas.append(json.loads(self.schema_text))
            self.schema_text = None


def canonical(page):
    return [link["href"] for link in page.links if link.get("rel") == "canonical"]


status, _, sitemap_body = fetch("/sitemap.xml")
assert status == 200
ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "x": "http://www.w3.org/1999/xhtml"}
sitemap = ET.fromstring(sitemap_body)
entries = {item.findtext("s:loc", namespaces=ns): item for item in sitemap.findall("s:url", ns)}
assert len(entries) == len(sitemap.findall("s:url", ns)), "Duplicate sitemap URLs"
assert not any("/index.md" in url or any(p in url for p in ["/login", "/signup", "/reset-password", "/welcome", "/api/"]) for url in entries)
for url in [SITE, SITE + "/ar"]:
    alternates = {item.get("hreflang"): item.get("href") for item in entries[url].findall("x:link", ns)}
    assert alternates == {"en": SITE, "ar": SITE + "/ar", "ar-SA": SITE + "/ar", "x-default": SITE}


def check_guide(file):
    slug = file.stem
    path = "/guides/" + slug
    raw = file.read_text()
    dates = dict(re.findall(r'^(date|updated): "([\d-]+)"', raw, re.M))
    expected_date = dates.get("updated", dates["date"])
    assert entries[SITE + path].findtext("s:lastmod", namespaces=ns).startswith(expected_date)
    status, _, html = fetch(path)
    assert status == 200, path
    page = Page(html)
    assert page.h1 == 1, path + " H1"
    assert canonical(page) == [SITE + path], path + " canonical"
    assert "noindex" not in page.meta.get("robots", ""), path
    assert page.meta.get("description"), path + " description"
    article = next(schema for schema in page.schemas if schema.get("@type") == "Article")
    assert article["datePublished"] == dates["date"] and article["dateModified"] == expected_date
    expected_language = re.search(r'^language: "([^"]+)"', raw, re.M).group(1)
    assert article["inLanguage"] == expected_language
    assert article["author"]["name"] == "312" and article["author"]["url"] == "https://312.sh"
    related = json.loads(re.search(r'^related: (.+)$', raw, re.M).group(1))
    assert len(related) >= 2 and all((ROOT / "content/guides" / (slug + ".mdx")).exists() for slug in related)
    for linked in re.findall(r'\]\(/guides/([^)#]+)\)', raw):
        assert (ROOT / "content/guides" / (linked + ".mdx")).exists(), linked
        assert "/guides/" + linked in page.anchors, linked
    assert any(link.get("type") == "text/markdown" and link.get("href") == SITE + path + "/index.md" for link in page.links)
    status, headers, text = fetch(path + "/index.md")
    assert status == 200 and headers.get("Content-Type", "").startswith("text/markdown"), path
    assert "Source: " + SITE + path in text
    assert "Author: 312 (https://312.sh)" in text
    assert "](/" not in text, path + " relative Markdown link"
    assert '<' + SITE + path + '>; rel="canonical"' in headers.get("Link", "")


files = sorted((ROOT / "content/guides").glob("*.mdx"))
assert len(entries) == len(files) + 4
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(check_guide, files))

for path in ["/login", "/signup", "/reset-password?token=seo-check"]:
    status, _, html = fetch(path)
    assert status == 200 and "noindex" in Page(html).meta.get("robots", ""), path
assert fetch("/guides/not-a-real-guide/index.md")[0] == 404

status, _, robots = fetch("/robots.txt")
assert status == 200 and "Sitemap: " + SITE + "/sitemap.xml" in robots
rules = urllib.robotparser.RobotFileParser()
rules.parse(robots.splitlines())
for bot in ["Googlebot", "Bingbot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"]:
    assert rules.can_fetch(bot, SITE + "/guides/open-docx-online")
    assert not rules.can_fetch(bot, SITE + "/api/auth/get-session")

for path, content_type in [("/llms.txt", "text/plain"), ("/llms.md", "text/markdown"), ("/llms-full.txt", "text/plain")]:
    status, headers, text = fetch(path)
    assert status == 200 and headers.get("Content-Type", "").startswith(content_type), path
    assert text.startswith("# EDTRpad") and SITE in text
    if path == "/llms.md":
        assert "formatting preserved" not in text and "does not guarantee identical" in text
    if path == "/llms-full.txt":
        assert text.count("Source: " + SITE + "/guides/") == 6
    if path == "/llms.txt":
        for url in re.findall(r'\]\((https://wordpad\.info[^)]+)\)', text):
            parsed = urllib.parse.urlsplit(url)
            assert fetch(parsed.path or "/")[0] == 200, url

for path in ["/", "/ar"]:
    status, _, html = fetch(path)
    page = Page(html)
    assert status == 200 and page.h1 == 1
    graph = next(schema["@graph"] for schema in page.schemas if "@graph" in schema)
    assert {node["@type"] for node in graph} >= {"WebSite", "Organization"}
    app = next(schema for schema in page.schemas if schema.get("@type") == "WebApplication")
    assert app["@id"] == SITE + "/#application" and app["url"] == SITE + "/pad"
    assert app["creator"]["url"] == "https://312.sh"
    for slug in ["online-word-alternative", "open-docx-online", "google-docs-alternative"]:
        assert "/guides/" + slug in page.anchors

print(f"PASS {BASE}: {len(entries)} sitemap URLs; {len(files)} HTML/Markdown guides; canonical, dates, JSON-LD, hreflang, noindex, robots and LLM resources")
