# CLAUDE.md — Online WordPad

Bu dosya, projeyle çalışan Claude için bağlam ve yönergeler içerir.

---

## Proje Özeti

**wordpad.online** — Tarayıcı tabanlı, ücretsiz, kayıt gerektirmeyen bir online metin editörü.
Hedef: WordPad'i arayan, Windows 11'de kaldırılmış bulan veya kurulum yapmak istemeyen kullanıcılara hitap etmek.

- **URL:** https://wordpad.online
- **Stack:** Next.js 16 · TypeScript · Tailwind v4 · ProseMirror · MDX
- **Deploy:** Vercel

---

## Dizin Yapısı

```
app/
  page.tsx                  → Landing page (hero, features, FAQ, CTA)
  layout.tsx                → Root layout
  globals.css               → Global stiller
  sitemap.ts                → Otomatik sitemap
  pad/                      → Editör sayfası (/pad)
  guides/
    page.tsx                → Guide listesi (/guides)
    [slug]/page.tsx         → Guide detay sayfası — MDX render (/guides/[slug])
  components/               → App-level client componentler (ToolbarPreviewClient vb.)

components/                 → Paylaşılan UI componentleri (shadcn tabanlı)
content/guides/             → MDX guide yazıları (SEO içeriği)
lib/
  guides.ts                 → MDX okuma yardımcıları (gray-matter)
public/                     → Statik dosyalar (og-image, favicon vb.)
```

---

## Guide Yazıları

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
- Ana domain: `https://wordpad.online`

---

## Önemli Notlar

- Editör tamamen client-side çalışır; localStorage'a yazar, hiçbir veri sunucuya gönderilmez.
- Guide sayfaları Next.js `generateStaticParams` ile statik olarak oluşturulur (SSG).
- MDX bileşen override'ları `app/guides/[slug]/page.tsx` içindeki `components` objesinde tanımlı.

---

## Sık Yapılan Görevler

### Yeni guide yazısı ekle
1. `content/guides/<slug>.mdx` oluştur (frontmatter'ı doldur)
2. Başka işlem gerekmez — otomatik listelenir ve route oluşturulur.

### Landing page'e bölüm ekle
`app/page.tsx` dosyasını düzenle.

### Stil değiştir
Tailwind class'larını doğrudan düzenle. Global CSS için `app/globals.css`.

---

## Yönergeler (Buraya ekle)

<!-- Kendi yönergelerini aşağıya yaz -->
