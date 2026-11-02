# CLAUDE.md — EDTRpad (Online WordPad)

Bu dosya, projeyle çalışan Claude için bağlam ve yönergeler içerir.

---

## Proje Özeti

**wordpad.info** — Tarayıcı tabanlı, ücretsiz, kayıt gerektirmeyen bir online metin editörü.
Hedef: WordPad'i arayan, Windows 11'de kaldırılmış bulan veya kurulum yapmak istemeyen kullanıcılara hitap etmek.

**Marka:** EDTRpad · **İşlev/SEO konumlandırması:** "online wordpad". UI ve ürün adı EDTRpad'dir;
metadata/içerik "online wordpad" anahtar kelimesini hedefler.

- **URL:** https://wordpad.info
- **Stack:** Next.js 16 · TypeScript · Tailwind v4 · ProseMirror · MDX
- **Deploy:** Vercel

---

## Dizin Yapısı

```
app/
  (site)/                   → Mevcut URL’ler: /, /pad, /guides, hesap sayfaları
    page.tsx                → İngilizce landing page
    layout.tsx              → İngilizce kök layout
  ar/                       → Statik Arapça landing, metadata ve RTL kök layout
  components/RootDocument.tsx → Paylaşılan HTML shell ve global metadata
  globals.css               → Global stiller
  sitemap.ts                → Otomatik sitemap
  (site)/pad/               → Editör sayfası (/pad)
  (site)/guides/
    page.tsx                → Guide listesi (/guides)
    [slug]/page.tsx         → Guide detay sayfası — MDX render (/guides/[slug])
  components/               → App-level client componentler (ToolbarPreviewClient vb.)

components/                 → Paylaşılan UI componentleri (shadcn tabanlı)
content/guides/             → MDX guide yazıları (SEO içeriği)
lib/
  guides.ts                 → MDX okuma yardımcıları (gray-matter)
  doc-export.ts             → DOCX (biçimlendirmeli, docx.js) + RTF exporter — dynamic import ile yüklenir
  doc-import.ts             → .txt/.md/.html/.docx (mammoth) → HTML import
  image-util.ts             → Görsel sıkıştırma/yeniden boyutlandırma (canvas)
  auth.ts / auth-client.ts  → better-auth (opsiyonel hesaplar, Google OAuth)
  db.ts                     → Postgres pool
public/
  sw.js                     → PWA service worker (/pad offline shell)
  icon-192.png, icon-512.png→ PWA ikonları
proxy.ts                    → Next 16 proxy (eski middleware): girişli kullanıcıyı / → /pad yönlendirir
app/manifest.ts             → PWA manifest
app/(site)/pad/layout.tsx          → Editör fontları (Google Fonts) sadece /pad'de yüklenir
```

---

## Guide Yazıları

Guide yazarı her zaman **312** olmalı (https://312.sh). Görünen byline, Article JSON-LD ve Markdown çıktısı `lib/guide-topics.ts` içindeki `GUIDE_AUTHOR` kaynağını kullanır. Yeni yazılarda konu (`topic`), dil (`language`), en az iki ilgili rehber (`related`) ve uygun olduğunda animasyon türü (`demo`: slash/docx/table/print) ekle; konuya uygun yazı içi bağlantılar kullan.

Her guide `content/guides/<slug>.mdx` olarak saklanır. Frontmatter zorunlu alanlar:

```mdx
---
title: "..."
description: "..."
keywords: ["...", "..."]
date: "YYYY-MM-DD"
---
```

When you need to write or requested to write guide texts or blog posts OR required seo optimization: behave like a expert seo blog writer, and get help from skills:
SEO Site Auditor
AEO Content Optimizer
Schema Markup Generator
E-E-A-T Content Scorer
Keyword Intent Classifier
Competitor Gap Finder
GBP Post Generator
Internal Linking Strategist
SEO Content Brief Writer
AI Search Visibility Checker already defined in skills. 

### Mevcut Guide'lar

| Slug | Hedef Keyword |
|---|---|
| `wordpad-online` | wordpad online |
| `free-wordpad` | free wordpad |
| `wordpad-alternative` | wordpad alternative |
| `wordpad-windows-11` | wordpad removed windows 11 |
| `browser-text-editor` | browser text editor |
| `online-document-editor` | online document editor |
| `online-notepad` | online notepad |
| `rich-text-editor-online` | rich text editor online |
| `simple-text-editor` | simple text editor |
| `text-editor-no-sign-up` | text editor no sign up |

**Yeni guide eklemek için:** `content/guides/<yeni-slug>.mdx` dosyası oluştur. Sistem otomatik keşfeder (`getAllGuideSlugs` fs.readdirSync kullanır).

---

## Geliştirme Komutları

```bash
npm run dev    # Geliştirme sunucusu — http://localhost:3000
npm run build  # Production build
npm run lint   # ESLint
```

---

## Tasarım Sistemi

- **Renkler:** Ağırlıklı olarak `gray-*` skalası. Birincil eylem rengi `gray-900` (siyaha yakın).
- **Yazı Tipleri:** Tailwind varsayılanı (`font-sans`).
- **Bileşenler:** shadcn/ui (`components.json` mevcut).
- **İkonlar:** `@phosphor-icons/react` — SSR için `dist/ssr` importu kullanılır.

---

## SEO Kuralları

- Her sayfa için `export const metadata` tanımlanmalı.
- Her sayfada `alternates.canonical` olmalı.
- Guide sayfaları `Article` JSON-LD, landing page `WebApplication + FAQPage + HowTo` JSON-LD içerir.
- Ana domain: `https://wordpad.info`

---

## Önemli Notlar

- Editör client-side çalışır; misafirlerde localStorage'a, üyelerde Postgres'e (server actions: `app/actions/user-data.ts`) kaydeder.
- Autosave 800ms debounce'lu; id schedule anında yakalanır ve dosya değiştirme/kapatma anında flush edilir (`flushSave`). Bu davranışı bozacak değişikliklerden kaçın.
- Görseller eklenirken client-side sıkıştırılır (`lib/image-util.ts`) — localStorage 5MB kotası için kritik.
- DOCX import, `lib/docx-formatting.ts` ile OOXML varsayılanlarını/stil kalıtımını ve doğrudan biçimlendirmeyi Mammoth çıktısına taşır. Font, punto ve hizalamayı düzeltirken liste/tablo/link/görsel yapısını koru; `scripts/check-docx-import.cjs` gerçek editörde import → export → tekrar import kontrolü yapar (Playwright gerekir).
- Sayfalama (`paginationPlugin.ts`) paragraf/liste öğesi ve rowspan ile bağlı tablo satır gruplarını ölçer. Tekrar eden başlıklar ve geçişler yalnızca dekorasyondur; belge modeline veya export’a kopyalama. Zoom hesabında küsuratlı CSS genişliğini kullan; ölçümde geçişleri gizle, son sayfa dolgusunu dekorasyonlar çizildikten sonra hesapla. `scripts/check-pagination.cjs` sayfa geometrisini, zoom’u, listeleri, uzun tabloları, kaydırmayı ve sayfa sonlarını test eder.
- Tablo özellikleri (`TablePropertiesDialog`, `lib/table-formatting.ts`) hücre seçimini tek işlemde biçimlendirir. Ekran stilleri ile OOXML özelliklerini birlikte güncelle; birleşik hücreleri ve seçilmeyen hücrelerin ayarlarını koru. `scripts/check-table-formatting.cjs` geri alma, kaydetme/yeniden yükleme ve DOCX döngüsünü doğrular.
- DOCX sayfa düzeni `doc.attrs.layout` içinde, HTML’de `data-edtr-layout` ile saklanır; aktif olmayan dosya dışa aktarımı ve sürüm geri yükleme de aynı metadatayı kullanmalı. `lib/docx-preservation.ts`, bölüm ayarlarını, üst/alt bilgi alanlarını ve ilişkili varlıkları, tablo/satır/hücre özelliklerini korur. Geçici export bookmark’larını çıktıda bırakma. İçe aktarılan dört kenar boşluğunu tek genel tercihle ezme. Çok bölümlü belgelerde `lib/document-sections.ts` bölüm ölçülerini ve kenar boşluklarını okur; sayfa zeminleri ve içerik genişlikleri yalnızca dekorasyonla çizilir. `scripts/check-sections.cjs` dikey/yatay/Letter görünümünü ve DOCX döngüsünü doğrular. Sayfadan uzun tek satırdaki hücrelerde eşzamanlı devam boşlukları kullanılır; dikey rowspan grupları da özgün hücre birleşimleri değiştirilmeden sayfalar arasında devam eder.
- Üst/alt bilgi düzenleyicisi (`HeaderFooterDialog`, `RunningEditor`) bölüm bazında normal/ilk/çift sayfa içeriklerini ve önceki bölüme bağlantıyı yönetir. PAGE/NUMPAGES canlı alanları, özgün metin/görseller ve uzaklıklar korunur. `header-footer-source.ts` ve `header-footer-export.ts` yalnızca gerektiğinde yüklenir; değiştirilmiş içeriklerin artık kullanılmayan XML/varlıklarını export paketinde bırakma. `scripts/check-header-footer.cjs` gerçek DOCX, iptal/uygula, kalıcılık, bölüm bağlantıları ve alanların Word döngüsünü kontrol eder.
- PDF (`lib/pdf-export.tsx`) bölüm bazında sayfa ölçülerini, ilk/çift sayfa üst/alt bilgilerini, bağlantılı içerikleri ve PAGE/NUMPAGES alanlarını PDF’in kendi sayfalamasına göre çözer. Yazdırma (`lib/print-layout.ts`) ölçülmüş editör sayfalarının salt okunur kopyalarını kullanır; bu geçici DOM’u kaydetme veya DOCX export’a katma. Yazdırma kopyalarında `contain: size layout` gereklidir; aksi hâlde Chromium bazı sayfalardaki metni atlayabilir. `scripts/check-pdf-print.cjs` gerçek tarayıcıdan PDF ve yazdırma çıktısı üretir; `scripts/check-pdf-output.py <geçici-dizin>` (pypdf gerekir) metin, alanlar, sayfa geometrisi ve doğal tablo devamını doğrular.
- About ve welcome ekranı `BrandCredit` ile 312.sh logosunu paylaşır; iletişim adresi `hello@312.sh`. `scripts/check-about.cjs` bağlantıları ve diyalog davranışını kontrol eder.
- Export'lar (`lib/doc-export.ts`) ve mammoth dynamic import ile yüklenir; ana bundle'a statik olarak import ETME.
- Guide sayfaları Next.js `generateStaticParams` ile statik olarak oluşturulur (SSG).
- MDX bileşen override'ları `app/(site)/guides/[slug]/page.tsx` içindeki `components` objesinde tanımlı.
- Sitemap guide tarihlerini frontmatter `date` alanından okur — guide güncellerken tarihi de güncelle.

---

## Sık Yapılan Görevler

### Yeni guide yazısı ekle
1. `content/guides/<slug>.mdx` oluştur (frontmatter'ı doldur)
2. Başka işlem gerekmez — otomatik listelenir ve route oluşturulur.

### Landing page'e bölüm ekle
`app/LandingClient.tsx` dosyasını düzenle. Metadata ve JSON-LD için `app/(site)/page.tsx`, `app/ar/page.tsx` ve `app/components/LandingStructuredData.tsx` dosyalarına bak.

### Stil değiştir
Tailwind class'larını doğrudan düzenle. Global CSS için `app/globals.css`.

---

## Yönergeler (Buraya ekle)

<!-- Kendi yönergelerini aşağıya yaz -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
