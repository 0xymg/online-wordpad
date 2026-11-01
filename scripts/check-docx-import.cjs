/** Browser regression: run against a local server, with Playwright available.
 * BASE_URL defaults to http://localhost:3107. Optional PLAYWRIGHT_MODULE and
 * CHROMIUM_PATH support an existing external Playwright installation.
 * Creates its DOCX fixtures in a temporary directory; never uses user files.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ExternalHyperlink,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  LevelFormat, PageBreak, Header, Footer, PageNumber, WidthType, BorderStyle, HeightRule,
} = require("docx");

async function fixture(dir) {
  const document = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22, color: "222222" } },
      },
      paragraphStyles: [
        {
          id: "FormatBase",
          name: "Format Base",
          basedOn: "Normal",
          run: { font: "Times New Roman", size: 28, color: "123456" },
          paragraph: { alignment: AlignmentType.RIGHT, spacing: { line: 360 } },
        },
        {
          id: "FormatChild",
          name: "Format Child",
          basedOn: "FormatBase",
          run: { font: "Garamond", size: 32 },
        },
      ],
      characterStyles: [
        {
          id: "Accent",
          name: "Accent",
          run: {
            font: "Courier New",
            size: 26,
            color: "C00000",
            bold: true,
            italics: true,
            underline: {},
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "steps",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, right: 1080, bottom: 1440, left: 1800, header: 360, footer: 500 }, pageNumbers: { start: 3 } }, titlePage: true },
        headers: { default: new Header({ children: [new Paragraph("312 LETTERHEAD")] }), first: new Header({ children: [new Paragraph("FIRST PAGE HEADER")] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES] })] })] }) },
        children: [
          new Paragraph({ children: [new TextRun("DEFAULT FORMAT")] }),
          new Paragraph({
            style: "FormatChild",
            children: [new TextRun("INHERITED RIGHT")],
          }),
          new Paragraph({
            style: "FormatChild",
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: "DIRECT LEFT",
                font: "Arial",
                size: 19,
                color: "008000",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "CENTER 24", font: "Georgia", size: 48 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [new TextRun("JUSTIFIED PARAGRAPH")],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "STYLED HEADING",
                font: "Verdana",
                size: 36,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun("Mixed "),
              new TextRun({ text: "CHARACTER STYLE", style: "Accent" }),
              new TextRun({
                text: " direct override",
                style: "Accent",
                font: "Arial",
                size: 20,
                bold: false,
                italics: false,
                underline: { type: "none" },
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({ text: "REPEATED TEXT", font: "Arial", size: 22 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "REPEATED TEXT",
                font: "Courier New",
                size: 40,
              }),
            ],
          }),
          new Paragraph({
            numbering: { reference: "steps", level: 0 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "NUMBERED ITEM", font: "Georgia", size: 28 }),
            ],
          }),
          new Paragraph({
            numbering: { reference: "steps", level: 1 },
            children: [new TextRun("NESTED ITEM")],
          }),
          new Paragraph({
            children: [
              new ExternalHyperlink({
                link: "https://312.sh",
                children: [
                  new TextRun({ text: "LINK TO 312", style: "Hyperlink" }),
                ],
              }),
            ],
          }),
          new Table({
            width: { size: 4500, type: WidthType.DXA }, columnWidths: [4500],
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 4500, type: WidthType.DXA },
                    shading: { fill: "DDEEFF" }, verticalAlign: "center",
                    borders: { top: { style: BorderStyle.DOUBLE, size: 16, color: "AA0000" }, bottom: { style: BorderStyle.SINGLE, size: 8, color: "0000AA" } },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                          new TextRun({
                            text: "TABLE CELL",
                            font: "Arial",
                            size: 30,
                            underline: {},
                            highlight: "yellow",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "SUPERSCRIPT", superScript: true }),
              new TextRun({ text: "SUBSCRIPT", subScript: true }),
              new TextRun({ text: "STRIKE", strike: true }),
            ],
          }),
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: Buffer.from(
                  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
                  "base64",
                ),
                transformation: { width: 20, height: 20 },
              }),
            ],
          }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [] }),
          new Paragraph({ children: [new TextRun("THEME FONT")] }),
          new Paragraph({ children: [new TextRun("BEFORE PAGE BREAK"), new PageBreak(), new TextRun("AFTER PAGE BREAK")] }),
          new Table({
            columnWidths: [1800, 2700, 3600], width: { size: 8100, type: WidthType.DXA },
            rows: [
              new TableRow({ tableHeader: true, height: { value: 600, rule: HeightRule.ATLEAST }, children: [
                new TableCell({ columnSpan: 2, width: { size: 4500, type: WidthType.DXA }, shading: { fill: "112233" }, children: [new Paragraph("MERGED HEADER")] }),
                new TableCell({ width: { size: 3600, type: WidthType.DXA }, children: [new Paragraph("HEADER C")] }),
              ] }),
              new TableRow({ children: [
                new TableCell({ rowSpan: 2, width: { size: 1800, type: WidthType.DXA }, children: [new Paragraph("VERTICAL MERGE")] }),
                new TableCell({ width: { size: 2700, type: WidthType.DXA }, children: [new Paragraph("ROW B")] }),
                new TableCell({ width: { size: 3600, type: WidthType.DXA }, children: [new Paragraph("ROW C")] }),
              ] }),
              new TableRow({ children: [
                new TableCell({ width: { size: 2700, type: WidthType.DXA }, children: [new Paragraph("LAST B")] }),
                new TableCell({ width: { size: 3600, type: WidthType.DXA }, children: [new Paragraph("LAST C")] }),
              ] }),
            ],
          }),
        ],
      },
    ],
  });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(document));
  // Theme-based font/color and direct-format override exercise Word's cascade,
  // not just docx-js's default direct formatting.
  let doc = await zip.file("word/document.xml").async("string");
  doc = doc.replace(
    /<w:r>(<w:t[^>]*>THEME FONT<\/w:t>)<\/w:r>/,
    '<w:r><w:rPr><w:rFonts w:asciiTheme="majorHAnsi"/><w:color w:themeColor="accent1" w:val="000000"/></w:rPr>$1</w:r>',
  );
  doc = doc.replace('<w:vMerge w:val="continue"/>', '<w:vMerge w:val="continue"/><w:tcBorders><w:bottom w:val="double" w:sz="16" w:color="990099"/></w:tcBorders>');
  zip.file("word/document.xml", doc);
  zip.file(
    "word/theme/theme1.xml",
    '<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test"><a:themeElements><a:clrScheme name="Test"><a:accent1><a:srgbClr val="336699"/></a:accent1></a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Cambria"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>',
  );
  const file = path.join(dir, "formatting-fixture.docx");
  await fs.writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  const bare = new JSZip();
  bare.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
  );
  bare.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="34"/></w:rPr><w:t>NO STYLES PART</w:t></w:r></w:p></w:body></w:document>',
  );
  const bareFile = path.join(dir, "no-styles.docx");
  await fs.writeFile(
    bareFile,
    await bare.generateAsync({ type: "nodebuffer" }),
  );
  return { file, bareFile };
}
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "edtr-docx-test-"));
  const { file, bareFile } = await fixture(dir);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      locale: "en-US",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const base = process.env.BASE_URL || "http://localhost:3107";
    await page.goto(base + "/pad");
    await page.locator(".ProseMirror").waitFor();
    async function open(file, expected) {
      await page.locator(".ProseMirror").fill("Import pending");
      await page.getByRole("menuitem", { name: "File", exact: true }).click();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("menuitem", { name: /^Open…/ }).click();
      await (await chooser).setFiles(file);
      const replace = page.getByRole("button", { name: "Replace document", exact: true });
      await Promise.race([replace.waitFor({ state: "visible" }), page.waitForFunction(text => document.querySelector(".ProseMirror")?.textContent.includes(text), expected)]);
      if (await replace.isVisible()) await replace.click();
      await page.waitForFunction(
        (text) =>
          document.querySelector(".ProseMirror").textContent.includes(text),
        expected,
      );
      await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    }
    async function downloadDocx(name) {
      await page.getByRole("menuitem", { name: "File", exact: true }).click();
      await page.getByRole("menuitem", { name: "Export", exact: true }).hover();
      const event = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: "Word (.docx)", exact: true }).click();
      const target = path.join(dir, name);
      await (await event).saveAs(target);
      return JSZip.loadAsync(await fs.readFile(target));
    }
    await open(file, "INHERITED RIGHT");
    assert.equal(await page.locator(".ProseMirror hr[data-page-break]").count(), 1);
    const facts = await page.locator(".ProseMirror").evaluate((root) => {
      const nodeFor = (text) => {
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode()))
          if (n.textContent.includes(text)) return n.parentElement;
        throw Error("Missing text " + text);
      };
      const get = (text) => {
        const n = nodeFor(text),
          s = getComputedStyle(n),
          p = n.closest("p,h1,h2,h3,h4,h5,h6");
        return {
          font: s.fontFamily,
          size: s.fontSize,
          color: s.color,
          weight: s.fontWeight,
          italic: s.fontStyle,
          align: p.style.textAlign,
          line: p.style.lineHeight,
          tag: p.tagName,
          underline: !!n.closest("u"),
          bg: s.backgroundColor,
        };
      };
      return {
        default: get("DEFAULT FORMAT"),
        inherited: get("INHERITED RIGHT"),
        direct: get("DIRECT LEFT"),
        center: get("CENTER 24"),
        justified: get("JUSTIFIED PARAGRAPH"),
        heading: get("STYLED HEADING"),
        character: get("CHARACTER STYLE"),
        override: get("direct override"),
        numbered: get("NUMBERED ITEM"),
        cell: get("TABLE CELL"),
        theme: get("THEME FONT"),
        repeated: Array.from(root.querySelectorAll("p"))
          .filter((p) => p.textContent === "REPEATED TEXT")
          .map((p) => ({
            align: p.style.textAlign,
            font: getComputedStyle(p.lastElementChild || p).fontFamily,
            html: p.innerHTML,
          })),
        list: root.querySelectorAll("ol li").length,
        table: root.querySelectorAll("table").length,
        image: root.querySelectorAll('img[src^="data:"]').length,
        link: root.querySelector('a[href="https://312.sh"]')?.textContent,
        super: root.querySelector("sup")?.textContent,
        sub: root.querySelector("sub")?.textContent,
        strike: root.querySelector("s")?.textContent,
        html: root.innerHTML,
      };
    });
    await fs.writeFile(
      path.join(dir, "imported-facts.json"),
      JSON.stringify(facts, null, 2),
    );
    assert.match(facts.default.font, /Calibri/);
    assert.equal(facts.default.size, "14.6667px");
    assert.match(facts.inherited.font, /Garamond/);
    assert.equal(facts.inherited.size, "21.3333px");
    assert.equal(facts.inherited.align, "right");
    assert.equal(facts.inherited.line, "1.5");
    assert.equal(facts.inherited.color, "rgb(18, 52, 86)");
    assert.match(facts.direct.font, /Arial/);
    assert.equal(facts.direct.size, "12.6667px");
    assert.equal(facts.direct.align, "left");
    assert.equal(facts.direct.color, "rgb(0, 128, 0)");
    assert.equal(facts.center.align, "center");
    assert.equal(facts.center.size, "32px");
    assert.equal(facts.justified.align, "justify");
    assert.equal(facts.heading.tag, "H2");
    assert.equal(facts.heading.align, "right");
    assert.match(facts.heading.font, /Verdana/);
    assert.equal(facts.heading.size, "24px");
    assert.match(facts.character.font, /Courier New/);
    assert.equal(facts.character.italic, "italic");
    assert.equal(facts.character.underline, true);
    assert.ok(+facts.character.weight >= 600);
    assert.match(facts.override.font, /Arial/);
    assert.equal(facts.override.italic, "normal");
    assert.equal(facts.override.underline, false);
    assert.ok(+facts.override.weight < 600);
    assert.equal(facts.numbered.align, "center");
    assert.match(facts.numbered.font, /Georgia/);
    assert.ok(facts.list >= 2);
    assert.equal(facts.table, 2);
    assert.equal(facts.cell.align, "right");
    assert.equal(facts.cell.underline, true);
    assert.equal(facts.image, 1);
    assert.equal(facts.link, "LINK TO 312");
    assert.equal(facts.super, "SUPERSCRIPT");
    assert.equal(facts.sub, "SUBSCRIPT");
    assert.equal(facts.strike, "STRIKE");
    assert.match(facts.theme.font, /Cambria/);
    assert.equal(facts.theme.color, "rgb(51, 102, 153)");
    assert.deepEqual(
      facts.repeated.map((p) => p.align),
      ["left", "right"],
    );
    assert.ok(!facts.html.includes("EDTRimport"));
    await page
      .locator(".ProseMirror p")
      .filter({ hasText: "INHERITED RIGHT" })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-label="Font family"]')
        .textContent.includes("Garamond"),
    );
    await page
      .locator(".ProseMirror p")
      .filter({ hasText: "DEFAULT FORMAT" })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-label="Font family"]')
        .textContent.includes("Calibri"),
    );
    assert.match(facts.default.font, /Carlito/);
    await page.screenshot({
      path: path.join(dir, "imported.png"),
      fullPage: true,
    });
    const geometry = await page.locator(".pm-page").evaluate(el => {
      const s = getComputedStyle(el);
      return [s.width, s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
    });
    assert.deepEqual(geometry, ["816px", "48px", "72px", "96px", "120px"]);
    const cells = await page.locator(".ProseMirror td,.ProseMirror th").evaluateAll(cells => cells.map(c => ({ text: c.textContent, colspan: c.colSpan, rowspan: c.rowSpan, fill: c.style.backgroundColor, border: c.style.borderTop })));
    assert.equal(cells.find(c => c.text.includes("TABLE CELL")).fill, "rgb(221, 238, 255)");
    assert.match(cells.find(c => c.text.includes("TABLE CELL")).border, /double/);
    assert.equal(cells.find(c => c.text.includes("MERGED HEADER")).colspan, 2);
    assert.equal(cells.find(c => c.text.includes("VERTICAL MERGE")).rowspan, 2);
    // Edit, wait for autosave, reload: metadata must live with saved document HTML.
    await page.locator(".ProseMirror").press("ControlOrMeta+End");
    await page.keyboard.type(" EDITED");
    await page.waitForFunction(() => (localStorage.getItem("wordpad-files") || "").includes("EDITED"));
    await page.reload();
    await page.locator(".ProseMirror").waitFor();
    await page.waitForFunction(() => document.querySelector(".ProseMirror")?.textContent.includes("EDITED"));
    assert.equal(await page.locator(".pm-page").evaluate(el => getComputedStyle(el).paddingLeft), "120px");
    // Download and inspect OOXML to prove formatting survives editing/export,
    // rather than being a temporary visual overlay outside the document model.
    await page.getByRole("menuitem", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "Export", exact: true }).hover();
    const download = page.waitForEvent("download");
    await page
      .getByRole("menuitem", { name: "Word (.docx)", exact: true })
      .click();
    const downloaded = await download;
    const output = path.join(dir, "roundtrip.docx");
    await downloaded.saveAs(output);
    const exported = await JSZip.loadAsync(await fs.readFile(output));
    const doc = await exported.file("word/document.xml").async("string");
    assert.match(doc, /w:jc w:val="right"/);
    assert.match(doc, /w:ascii="Garamond"/);
    assert.match(doc, /w:sz w:val="32"/);
    assert.match(doc, /w:sz w:val="19"/);
    const layoutFacts = await page.evaluate(xml => {
      const d = new DOMParser().parseFromString(xml, "application/xml");
      const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      const els = (n, name) => Array.from(n.getElementsByTagNameNS(w, name));
      const attrs = el => Object.fromEntries(Array.from(el.attributes).filter(a => a.namespaceURI === w).map(a => [a.localName, a.value]));
      return { size: attrs(els(d, "pgSz").at(-1)), margins: attrs(els(d, "pgMar").at(-1)), pageNum: attrs(els(d, "pgNumType").at(-1)), grids: els(d, "tblGrid").map(g => els(g, "gridCol").map(c => c.getAttributeNS(w, "w"))), fills: els(d, "shd").map(attrs), merges: els(d, "vMerge").map(attrs), repeats: els(d, "tblHeader").length };
    }, doc);
    assert.equal(layoutFacts.size.w, "12240"); assert.equal(layoutFacts.size.h, "15840");
    assert.deepEqual(["top", "right", "bottom", "left", "header", "footer"].map(k => layoutFacts.margins[k]), ["720", "1080", "1440", "1800", "360", "500"]);
    assert.equal(layoutFacts.pageNum.start, "3");
    assert.deepEqual(layoutFacts.grids, [["4500"], ["1800", "2700", "3600"]]);
    assert.ok(layoutFacts.fills.some(f => f.fill === "DDEEFF"));
    assert.ok(layoutFacts.merges.some(m => m.val === "restart"));
    assert.ok(layoutFacts.merges.some(m => !m.val || m.val === "continue"));
    assert.equal(layoutFacts.repeats, 1);
    assert.match(doc, /w:color="990099"/);
    const retainedParts = await Promise.all(Object.entries(exported.files).filter(([p, e]) => !e.dir && p.startsWith("word/edtr-source/") && p.endsWith(".xml")).map(([, e]) => e.async("string")));
    assert.ok(retainedParts.some(p => p.includes("FIRST PAGE HEADER")));
    assert.ok(retainedParts.some(p => p.includes("312 LETTERHEAD")));
    assert.ok(retainedParts.some(p => /\bPAGE\b/.test(p) && /\bNUMPAGES\b/.test(p)));
    assert.ok(!doc.includes("EDTRLayout"));
    await open(output, "INHERITED RIGHT");
    assert.equal(
      await page
        .locator(".ProseMirror p")
        .filter({ hasText: "INHERITED RIGHT" })
        .evaluate((p) => p.style.textAlign),
      "right",
    );
    assert.equal(await page.locator(".ProseMirror hr[data-page-break]").count(), 1);
    // Page controls must alter this document and persist without requiring typing.
    async function pageControl(submenu, item) {
      await page.getByRole("menuitem", { name: "File", exact: true }).click();
      await page.getByRole("menuitem", { name: submenu, exact: true }).hover();
      await page.getByRole("menuitemcheckbox", { name: item, exact: true }).click();
    }
    await pageControl("Page setup", "Landscape");
    await pageControl("Page setup", "Page Margin: 2 cm");
    await pageControl("Page numbers", "None");
    const changedZip = await downloadDocx("changed-layout.docx");
    const changedXml = await changedZip.file("word/document.xml").async("string");
    const changedFacts = await page.evaluate(xml => {
      const d = new DOMParser().parseFromString(xml, "application/xml");
      const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      const get = name => d.getElementsByTagNameNS(w, name)[0];
      return { width: get("pgSz").getAttributeNS(w, "w"), height: get("pgSz").getAttributeNS(w, "h"), margins: ["top", "right", "bottom", "left"].map(k => get("pgMar").getAttributeNS(w, k)) };
    }, changedXml);
    assert.deepEqual(changedFacts, { width: "15840", height: "12240", margins: ["1134", "1134", "1134", "1134"] });
    const changedParts = await Promise.all(Object.entries(changedZip.files).filter(([p, e]) => !e.dir && p.startsWith("word/edtr-source/") && /\.xml$/.test(p)).map(([, e]) => e.async("string")));
    assert.ok(changedParts.some(p => p.includes("312 LETTERHEAD")));
    assert.ok(!changedParts.some(p => /<w:instrText[^>]*>[^<]*\bPAGE\b/.test(p)));
    await page.waitForFunction(() => {
      const file = JSON.parse(localStorage.getItem("wordpad-files") || "[]")[0];
      return file?.html.includes("15840") && file.html.includes("1134");
    });
    await page.reload();
    await page.locator(".ProseMirror").waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".pm-page")).width === "1056px");
    // Distinct section settings stay attached to the section-ending paragraph.
    const sectionZip = await JSZip.loadAsync(await fs.readFile(file));
    const sectionXml = await page.evaluate(xml => {
      const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      const d = new DOMParser().parseFromString(xml, "application/xml");
      const body = d.getElementsByTagNameNS(w, "body")[0];
      const last = Array.from(body.children).find(e => e.localName === "sectPr");
      const first = last.cloneNode(true);
      const p = d.getElementsByTagNameNS(w, "p")[0];
      const props = d.createElementNS(w, "w:pPr"); props.appendChild(first); p.insertBefore(props, p.firstChild);
      const size = last.getElementsByTagNameNS(w, "pgSz")[0]; size.setAttributeNS(w, "w:w", "16838"); size.setAttributeNS(w, "w:h", "11906"); size.setAttributeNS(w, "w:orient", "landscape");
      last.getElementsByTagNameNS(w, "pgMar")[0].setAttributeNS(w, "w:left", "999");
      return new XMLSerializer().serializeToString(d);
    }, await sectionZip.file("word/document.xml").async("string"));
    sectionZip.file("word/document.xml", sectionXml);
    const sectionPath = path.join(dir, "sections.docx");
    await fs.writeFile(sectionPath, await sectionZip.generateAsync({ type: "nodebuffer" }));
    await open(sectionPath, "INHERITED RIGHT");
    const sectionOutput = await downloadDocx("sections-roundtrip.docx");
    const sectionFacts = await page.evaluate(xml => {
      const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      const d = new DOMParser().parseFromString(xml, "application/xml");
      return Array.from(d.getElementsByTagNameNS(w, "sectPr")).map(s => ({ parent: s.parentElement.localName, width: s.getElementsByTagNameNS(w, "pgSz")[0].getAttributeNS(w, "w"), left: s.getElementsByTagNameNS(w, "pgMar")[0].getAttributeNS(w, "left") }));
    }, await sectionOutput.file("word/document.xml").async("string"));
    assert.deepEqual(sectionFacts, [{ parent: "pPr", width: "12240", left: "1800" }, { parent: "body", width: "16838", left: "999" }]);
    await open(bareFile, "NO STYLES PART");
    const bare = await page
      .locator(".ProseMirror p")
      .filter({ hasText: "NO STYLES PART" })
      .evaluate((p) => ({ align: p.style.textAlign, html: p.innerHTML }));
    assert.equal(bare.align, "right");
    assert.match(bare.html, /17pt/);
    assert.deepEqual(errors, []);
    console.log(
      "PASS DOCX formatting: defaults, style inheritance, direct overrides, theme fonts/colors, alignment, sizes, lists, tables, links, images, empty styles, per-document layout controls, margins, page fields, headers, merged/styled tables, section boundaries and DOCX roundtrip. Artifacts: " +
        dir,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
