# A6 — APA 7 ve IEEE kaynakça uygulama sözleşmesi

Durum: 3 Kasım 2026; ilk APA 7 / IEEE uygulaması ve yerel üretim kabulü tamamlandı, canlı yayın kabulü bekleniyor. Güncel kapsam ve açık sınırlar [bibliography-acceptance.md](bibliography-acceptance.md) içindedir. [Onaylı planın A6 kapsamını](advanced-document-plan.md#a6--kaynakça) somutlaştırır. Yeni ürün onayı istemez. Aşağıdaki başlangıç sözleşmesi uygulanırken exact citeproc bağımlılığı, yerel varlıklar ve sürüm 6 belge modeli eklendi. Ön koşul A5 dipnot canlı kabulü `d97ea95` ile tamamlandı.

## İlk destek sınırı

| Konu | İlk düzenlenebilir kapsam | Bu pakette tamamlandı sayılmayacak alan |
| --- | --- | --- |
| Kaynak türleri | Kitap (`book`), dergi makalesi (`article-journal`), web sayfası (`webpage`) | Bölüm, tez, konferans, mevzuat ve diğer CSL türleri |
| Stiller | Sabitlenmiş resmi CSL APA 7 ve IEEE dosyaları | Birkaç elle yazılmış metin şablonuyla tam stil desteği |
| Atıflar | Ana metin, liste ve tablo hücresinde tek veya çok kaynaklı küme; kaynak başına locator, prefix/suffix; APA normal ve yazar bastırılmış biçim | Dipnot/sonnot gövdesindeki atıflar; bir atomun dışına bölünmüş canlı anlatısal atıf; iç içe alanlar |
| Kaynakça | Belgeye ait bir canlı kaynakça işaretçisi; kullanıcı işaretçinin yerini seçer | Bölüm başına farklı stiller, birden fazla bağımsız kaynakça, türe göre alt listeler |
| Kaynak girişi | Kullanıcının girdiği yapısal bilgi; eksik alan uyarıları | DOI/URL üzerinden ağ araması, otomatik kaynak bulma veya eksik bilgi uydurma |
| Diller | EN/TR/FR/ZH/AR arayüz; Unicode/RTL kaynak verisi; belgede açık kaynakça locale'i | Arayüz dili değişince kaynakça dilini veya yazarın adını kendiliğinden değiştirme |
| Çıktılar | HTML/kayıt/undo/clipboard'da yapı; ortak ekran/PDF/baskıda aynı sonuç; TXT/MD/RTF'de açık biçimlendirilmiş kopya | Word Online'ın bütün kaynakları canlı düzenleyip aynı APA/IEEE metnini yeniden ürettiği iddiası |

APA normal/yazar bastırılmış çıktı ilk küme API'sini kapsar. Canlı anlatısal `Yazar (Yıl)` biçimi ayrı `composite` sözleşmesi ve fixture ile eklenebilir; normal atfın metninden parantez/yazar adı kesilerek üretilmez. Kaynakça desteği APA 7 veya IEEE'nin bütün makale sayfa düzenini uygulama anlamına gelmez.

## Kodda görülen entegrasyon noktaları

- `lib/document-model.ts` mevcut sürüm 5'i ve ortak `parseDocumentHtml` / `migrateDocumentNode` yükleme kapısını yönetiyor. A6 kaynak havuzu burada sürüm 6'ya eklenmeli; ayrı localStorage havuzu kurulmayacak.
- `lib/document-identity.ts` zaten `src_…` ve `fld_…` kimliklerini, tahsis/klonlama ve belirsiz eşleme yardımcılarını içeriyor. DOI, yazar/yıl, Word tag'i ve görünür IEEE numarası kimlik değildir.
- `lib/document-references.ts` kopyala/kes/yapıştırın mevcut tek tüketicisi. A6 bu fragman planını genişletmeli; ikinci clipboard eklentisi yeterli olmaz.
- A4 TOC ve A5 sonnot kopyaları türetilmiş üst düzey bloklar. A6 kaynakça satırları da aynı paragraf ölçüm/akış yolunu kullanmalı; ayrı PDF kaynağı veya ekran dışına eklenen ikinci liste oluşturulmayacak.
- A5 not gövdesi doğrulayıcısı `fieldId` ve alan düğümlerini bugün reddediyor. İlk A6 paketinde bu sınır korunur; nota atıf yapıştırmak sessiz düz metne çevrilmez.
- `lib/reference-docx.ts` alanları Mammoth'tan önce sahipleniyor; `CITATION` / `BIBLIOGRAPHY` şu anda A6 nesnesi değil. Yeni native dönüştürücü bu alanları A4 genel alan dönüştürücüsünden **önce** tanımalı.
- `flushDocumentOutputLayout` notları, referansları ve gerçek sayfaları aynı revision üzerinde sonuçlandırıyor. Kaynakça güncellemesi bu kapıya girmeli. `Editor` dışa aktarmada yakalanmış immutable belge snapshot'ını kullanıyor; lazy yüklemeden sonra güncel başka belgeye geçilemez.

## CSL motoru, stil ve lisans kararı

Önerilen birinci aday `citeproc-js`'dir; npm adı `citeproc` olan mevcut upstream paket bildirimi `2.4.63` sürümünü gösteriyor. Motor, resmi CSL girdileriyle uygulanabilir bir adaptör arkasında tutulur. Yeni bağımlılığın exact sürümü, tarball integrity'si ve kaynak commit'i uygulama başlangıcında sabitlenir; bu belge bir paket kurulum kaydı değildir. [Upstream paket bildirimi](https://raw.githubusercontent.com/Juris-M/citeproc-js/master/package.json), [motor deposu](https://github.com/Juris-M/citeproc-js).

Lisanslar birbirinden ayrıdır:

| Varlık | Kontrol edilen upstream koşulu | Uygulama işi |
| --- | --- | --- |
| `citeproc-js` motoru | `LICENSE`, alternatif CPAL-1.0 veya AGPL-3.0-or-later metinlerini sunuyor | Seçilen dağıtım yolunu, tam lisans metinlerini, bildirim/atıf ve uygulanabilir kaynak dağıtımını üçüncü taraf manifestinde açıkça belgelemek |
| npm metadata | Kontrol edilen `package.json`, AGPL dalını `AGPL-1.0` diye yazıyor; `LICENSE` dosyasındaki AGPL-3 ifadesiyle uyuşmuyor | Gerçek seçilecek tarball ve başlıklarını incelemek; metadata'yı lisans metni yerine kabul etmemek |
| CSL stilleri | Resmi stil deposu CC BY-SA 3.0 ve CSL atfı istiyor | Orijinal metadata, yazarlar, lisans, kaynak URL/commit ve SHA-256'yı korumak; değişiklik varsa ayrı yama ve bildirim tutmak |
| CSL locale dosyaları | Resmi locale deposu CC BY-SA 3.0; çevirmen listesi ve CSL atfı korunmalı | Kullanılan locale dosyalarını aynı manifestle paketlemek |

Bunlar doğrulanmış upstream bildirimleridir; farklı bağımlılığın lisansını seçilen motora aktarmaz. Citation.js üst katmanı MIT lisanslıdır, ancak bu, içinde kullanılacak CSL motorunun ayrı lisansını değiştirmez. [Motor LICENSE](https://raw.githubusercontent.com/Juris-M/citeproc-js/master/LICENSE), [CPAL metni](https://raw.githubusercontent.com/Juris-M/citeproc-js/master/CPAL), [CSL stil lisansı](https://github.com/citation-style-language/styles), [locale lisansı](https://github.com/citation-style-language/locales), [Citation.js lisansı](https://raw.githubusercontent.com/citation-js/citation-js/master/LICENSE.md).

`citeproc-rs` MPL-2.0 ve WASM seçeneği sunuyor; ancak upstream kendisini devam eden çalışma olarak tanımlıyor ve sürüm deposu arşivli. WASM yaşam döngüsü, build ve karşılaştırmalı stil testleri ayrı maliyet getirir. Bu nedenle ilk aday yerine otomatik seçilmeyecek. Motor değiştirmek kaynak modelini değiştirmemeli. [citeproc-rs README](https://github.com/zotero/citeproc-rs), [lisansı](https://raw.githubusercontent.com/zotero/citeproc-rs/master/LICENSE.md), [arşivli sürümler](https://github.com/zotero/citeproc-rs/releases).

Resmi `apa.csl` dosyasının başlığı **APA Style 7th edition**, `ieee.csl` dosyasının başlığı **IEEE Reference Guide version 11.29.2023**. Üründeki kısa seçenekler APA 7 ve IEEE olur; manifest tam stil sürümünü taşır. Uygulama sırasında dosyaların commit/hash'i sabitlenir; `master` URL'sinden her belge açılışında güncel stil çekilmez. [APA stili](https://raw.githubusercontent.com/citation-style-language/styles/master/apa.csl), [IEEE stili](https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl).

Çalışma zamanı yerel ve lazy yüklenir. Gereken stiller/locale'ler uygulamayla gelir; `retrieveItem` yalnız kanonik havuzu, `retrieveLocale` paketlenmiş dosyaları okur. DOI veya URL hiçbir biçimlendirme işlemi sırasında ağ isteğine çevrilmez. İlk sürüm deterministik tam yeniden hesaplama kullanır; worker veya artımlı optimizasyon ancak aynı sonuç fixture'larıyla eklenir.

3 Kasım ön incelemesinde exact `citeproc@2.4.63` tarball'u ve sabitlenmiş resmi stiller/locale'ler yalnız geçici dizine alındı. Paket `LICENSE` dosyası iki lisans yolunu belirtiyor, ancak tam CPAL/AGPL metinlerini içermiyor; runtime kendi işlemci sürümünü `1.4.61` olarak bildiriyor. Kaynak pinleri ve SHA-256 değerleri [bibliography-preflight.json](bibliography-preflight.json) içinde. Tarayıcı paketleme ve belirlenimci küme testleri henüz çalıştırılmadı; projeye bağımlılık kurulmadı. Uygulamadan önce atıf/bildirim ve kapsanan kaynak dağıtımı somut paketleme adımlarıyla tamamlanmalı; bu ön inceleme hukuki uygunluk garantisi değildir.

## Kanonik v6 ve doğrulama

Önerilen sınır; gerçek TypeScript tipleri uygulama dosyasında tek otorite olacaktır:

```ts
type SourceName =
  | { family: string; given?: string; suffix?: string; particle?: string }
  | { literal: string }; // kurumsal yazar

type SourceDate = { year: number; month?: number; day?: number };
type SourceRecord = {
  type: "book" | "article-journal" | "webpage";
  title: string;
  authors: SourceName[];
  editors?: SourceName[];
  issued?: SourceDate; // yoksa gerçekten tarihsizdir
  containerTitle?: string;
  publisher?: string;
  publisherPlace?: string;
  edition?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  DOI?: string;
  URL?: string;
  accessed?: SourceDate;
  language?: string;
  native?: { partUri: string; tag: string; guid?: string; rawXml?: string };
};
type CitationItem = {
  sourceId: string; // geçerli src_…
  locator?: string;
  label?: "page" | "chapter" | "section" | "volume";
  prefix?: string;
  suffix?: string;
};
type CitationAttrs = {
  fieldId: string; // geçerli fld_…; kümenin kalıcı kimliği
  items: CitationItem[];
  mode: "normal" | "suppress-author";
  // cachedRuns/status/revision yalnız doğrulanmış türetilmiş sonuçtur.
};
type BibliographyConfiguration = {
  style: "apa7" | "ieee";
  locale: "en-US" | "tr-TR" | "fr-FR" | "zh-CN" | "ar";
  includeUncited: boolean;
};
type DocumentModelV6 = Omit<DocumentModelV5, "version"> & {
  version: 6;
  sources: Record<string, SourceRecord>;
  bibliography: BibliographyConfiguration;
};
```

Kaynakça işaretçisi üst düzey paragrafta `bibliography: { fieldId }` attr'ı taşır. İlk pakette belge başına en fazla bir işaretçi vardır; stil/locale belge ayarıdır. İşaretçinin başlık metni kullanıcı metnidir; onu izleyen girdiler havuzdan üretilir. Atıf `citation_field` adlı satır içi seçilebilir atom olur; A4 `reference_field` ile karıştırılmaz.

Doğrulama kuralları:

- `src_…` havuz anahtarı ve `fld_…` küme/işaretçi kimliği geçerli ve benzersizdir. Aynı kaynak birçok kümede kullanılabilir; her kümenin tek sahibi vardır.
- Her kümenin en az bir geçerli kaynağı vardır. İlk UI aynı kaynağı aynı kümede iki kez kabul etmez; birden fazla sayfa/range tek locator alanında yazılır. Kaynak başına ayrı locator/prefix/suffix korunur.
- İnsan adı ile kurumsal ad farklı yapılardır; boşluk veya virgülden kişi sayısı tahmin edilmez. Yazar sırası korunur. `et al.` metni veri yerine işlemci tarafından türetilir.
- Girişler düz veridir; kaynak başlığına veya yazar adına HTML enjekte edilmez. Tarih parçaları takvimsel olarak doğrulanır; boş tarih bugünün tarihiyle doldurulmaz. DOI/URL benzerliği kaynak birleştirme yetkisi değildir.
- Eksik yazar/tarih/yayın bilgisi kaynak türüne göre kullanıcıya gösterilir; eksik bilgi uydurulmaz. Boş kaynak adı/başlığı, bozuk tarih/URL ve desteklenmeyen alanlar açık doğrulama sonucu verir.
- Kullanılmayan kayıt bozuk model değildir. Son atıf silinince kaynak havuzda kalır. Başvurulan kaynağı silme, ilgili kümeleri atomik düzenlemeden sessiz gerçekleşmez.
- `cachedRuns` destekli metin/mark/link verisidir; çalıştırılacak veya doğrudan `innerHTML`'e yazılacak güvenilir HTML değildir. Yüklemede cache havuzun üzerine yazılmaz.
- v0–v5 → v6 geçişi mevcut belge/bölüm/hedef/not/alan kimliklerini ve not politikalarını korur, boş kaynak havuzu ile açık varsayılanlar (`apa7`, `en-US`, cited-only) ekler. Düz metindeki `(Yazar, 2020)` / `[1]` görünüşünden atıf türetilmez.
- Gelecek sürüm, yinelenen kimlik, bulunamayan kaynak veya güvenli çevrilemeyen native grafik önceki açık belgenin üzerine kaydedilmeden reddedilir.

## Motor adaptörü ve deterministik güncelleme

CSL-JSON'a tek yönlü adaptör `id = sourceId` atar; kullanıcı verisi bu kimliği ezemez. Kaynak türleri CSL türlerine, insan/kurum adları ad/literal yapılarına, tarihler `date-parts` dizilerine açık eşlenir. İlk kapsam dışındaki CSL alanları kullanıcıya destekli alan diye sunulmaz.

Üretim yolu `processCitationCluster` ve bütün belge sırasını kullanır. API, tek bir küme değişince önceden var olan kümeler için de yeni sonuç döndürebilir; bütün dönen sonuçlar kendi `fieldId`'lerine uygulanır. Basit `makeCitationCluster` yöntemi bağlamsal sıralama/disambiguation yapmadığı için üretim kısayolu olamaz. [İşlemci API'si](https://citeproc-js.readthedocs.io/en/latest/running.html).

Önerilen saf sınır:

```ts
formatBibliographySnapshot({ sources, orderedClusters, configuration, assets })
  => { clustersByFieldId, entries, entrySourceIds, paragraphLayout, diagnostics };
```

1. Üretilmiş TOC/not/kaynakça blokları atlanarak ana metindeki kanonik kümeler belge sırasıyla toplanır. Note-local pozisyonlar bu ilk kapsamda küme sırasına eklenmez.
2. Her revision için işlemci temiz kanonik veriden kurulur. Kayıt anahtarlarının nesne eklenme sırası yerine açık kararlı kaynak listesi kullanılır; kümeler belge sırasındadır. Processor state depolanmış model değildir.
3. Cited-only varsayılandır. `includeUncited` açılırsa kullanılmayan kaynaklar `updateUncitedItems` yoluyla eklenir. Stil sırası uygulama tarafından elle alfabetik veya sayısal sıralamayla taklit edilmez.
4. Aynı yazar/yıl ayrımı ve IEEE ilk atıf numaraları bütün kaynak/küme kümesinden hesaplanır. UI adı veya eski render numarası hiçbir eşleme anahtarı olmaz.
5. Sonuç, kaynak+küme+stil/locale asset hash'iyle ilişkilendirilir. Async işlem eski revision'da tamamlanırsa uygulanmaz. Aynı girdinin tekrar çalışması aynı sonuç/cache üretmelidir.
6. Kaynak düzenlemesi, küme ekleme/silme, stil/locale ve includeUncited değişimi ana editör geçmişinde atomiktir. Türetilmiş cache güncellemeleri ayrı undo adımı oluşturmaz; undo/redo tekrar aynı grafı ve sonucu üretir.
7. HTML çıktısı açık izinli etiket/mark/link kümesine çevrilir. Processor `hangingindent`, `second-field-align`, `entryspacing`, `linespacing` ve `entry_ids` verisi mevcut paragraf/sekme biçimlerine eşlenir. IEEE sol numara sütunu keyfi boşluklarla taklit edilmez. `entry_ids` tek ID varsayımına zorlanmaz.
8. Uygulama locale'i ile kaynakça locale'i ayrıdır. Paketlenmiş locale ve açık `forceLang` politikası kullanılır; makinenin varsayılan locale'i ve saat deterministik girdinin yerine geçmez. Desteklenen tarayıcılar arası sonuç eşitliği fixture ile ölçülür.

CSL item/küme ayrımı, locator ve küme kimliği sözleşmesi [CSL-JSON işlemci belgelerinde](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html) tanımlıdır. Bu planın UI alan kısıtları bu açık veri biçiminin tamamını desteklediği iddiası değildir.

## Projeksiyon, yerleşim ve geçmiş

Kaynakça girdileri normal üst düzey paragraf kopyalarıdır; atomik uzun kaynakça kutusu veya bağımsız tablo oluşturulmaz. Önerilen marker'lar `bibliographyOwnerId: fld_…`, `bibliographyEntry: number`, `bibliographySourceIds: src_…[]` olur. Girdiler içindeki kaynak adı/URL yeni kaynak tanımı veya atıf sahibi değildir.

Türetilmiş girdilere typing, paste, drag, backspace/delete veya biçim komutları doğrudan yazamaz. Yalnız `contenteditable=false` yeterli değildir. Ana metin ile cache'i kapsayan range replace kanonik aralığa eşlenir; cache öneki/soneki kullanıcı metnine katılmaz. A5'in DOM normalizasyonu için sessiz red sınırı gerçek değişikliklere genişletilmez.

Bölüm sonu kaynağın son kanonik bloğunun **sonundadır**. Kaynakça projeksiyonu sınırı son generated paragrafa taşır; cache kaldırılırken sınır doğrulanmış önceki kanonik bloğa geri gelir. A5 sonnotlarıyla aynı uçtaki açık sıra:

`unprojectBibliography → unprojectEndnotes → kullanıcı işlemi → projectBibliography → projectEndnotes → projectDocumentModel`.

Bu sıra ve bitişik iki farklı cache grubunun sınır aktarımı fixture ile doğrulanmadan bölüm komutlarına entegrasyon tamamlandı sayılmaz. Kaynakça işaretçisi canonical kalır; generated girdiler registry veya bölüm havuzu yaratmaz. Referans/hedef/not/kaynak koleksiyonları ve kimlik planlayıcıları bütün generated kökleri atlar.

Çıktı kapısı kaynakça biçimlendirmesini bitirir, ardından mevcut not/referans/sayfa döngüsünü aynı revision'da sonuçlandırır. Kaynakça satırları sayfa değiştirince TOC/PAGEREF ve dipnot rezervleri tekrar aynı fiziksel yerleşime bağlanır. Yakınsama sınırına ulaşmak başarı sayılmaz. Salt okunur/aktif olmayan belge de aynı formatter ve ortak renderer'ı kullanır.

## Clipboard, kaydet/aç ve çoğaltma

| İşlem | Küme/işaretçi kimliği | Kaynak kaydı |
| --- | --- | --- |
| Aynı belgeye normal kopya | Yeni `fld_…` | Doğrulanmış aynı açık belge bağlamında mevcut `src_…` kullanılır |
| Dış belgeye kopya | Yeni `fld_…` | Fragmanda kullanılan kaynaklar yeni `src_…` ile bir kez klonlanır; küme içi kenarlar aynı planla yeniden yazılır |
| Aynı belgede güvenilir cut/move | A4/A5 tek kullanımlı aktarım koşulları sağlanırsa korunur | Kaynak havuzu kaybolmaz; kaynak sayısı atıf sahibi sayısına bağlı değildir |
| Provenance yok/bozuk, aynı ID veya DOI görünümü | Hareket yetkisi vermez | İç kenarlar kanıtla eşlenir; isim/DOI ile hedef kaynağa tahmini bağ kurulmaz |
| Template/duplicate | Belge ve tüm sahip olunan alan kimlikleri klonlanır | Bütün kaynak altgrafı yeni kimliklerle klonlanır |
| Tam dosya aç/versiyon geri yükle | Geçerli kimlikler korunur | Havuz, kümeler ve ayarlar birlikte doğrulanır |

Fragman yalnız seçili atıfların gerekli kaynaklarını taşır; hedef belgenin bütün kaynakça stilini/locale'ini veya kaynak havuzunu üzerine yazamaz. Aynı dış kaynağa başvuran iki gelen küme fragman içinde tek yeni kaydı paylaşır. Kullanıcı açık birleştirme komutu verirse iki farklı `src_…` bütün başvurular birlikte yeniden yazılarak birleştirilebilir; otomatik DOI dedup yapılmaz. Generated kaynakça satırları kopyaya ikinci sahip veya kaynak kaydı olarak girmez.

## DOCX ve gerçek Word sınırı

Üç ayrı sonuç raporlanır: kaynak grafının korunması, görünür biçimlendirilmiş metin ve Word'ün kendi kaynak yöneticisiyle canlı düzenleme/yeniden hesaplama.

Word `CITATION Tag` alanında **büyük/küçük harfe duyarlı** tag ile kaynağa bağlanır; `\m` aynı kümeye ikinci kaynağı, `\l` locale'i, `\f`/`\s` prefix/suffix'i belirtir. Bunlar uygulamadaki `src_…`/`fld_…` kimlikleri değildir. `BIBLIOGRAPHY` ayrı bir alandır ve Word'ün seçili stiline göre yeniden üretilebilir. Microsoft'un bu alan belgeleri masaüstü Word içindir; Word Online'da aynı düzenleme/yenileme yeteneğini kanıtlamaz. [CITATION](https://support.microsoft.com/en-us/word/field-codes-citation-field), [BIBLIOGRAPHY](https://support.microsoft.com/en-us/word/field-codes-bibliography-field).

Kaynak bilgisi `b:Sources` / `b:Source` grafıdır; Source Manager'ın yerel `Sources.xml` dosyası DOCX içindeki belgeye ait kayıt grafı yerine alınmaz. Native dönüştürücü gerçek ilişki/part grafını ve namespace'i izler; dosya adı, kaynak sırası veya görünen yazar/yılla eşlemez. [Open XML Sources](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.bibliography.sources?view=openxml-3.0.1), [Source](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.bibliography.source?view=openxml-3.0.1), [Microsoft özel stil açıklaması](https://learn.microsoft.com/en-us/office/vba/word/Concepts/Objects-Properties-Methods/create-custom-bibliography-styles).

A6 uygulaması iki açık native profille ilerler:

1. **Biçimlendirilmiş DOCX kopyası:** doğrulanmış CSL sonuçları normal native run/paragraflardır; kaynak/küme/ayar grafı uygulamaya ait sürümlü ilişkili metadata ile birlikte taşınır. EDTRDocs yeniden açılışında yalnız sağlam kimlik+taşıyıcı eşleşmesi kanoniği geri kurar. Word'e görünür metni serbest düzenleme yeteneği ile Word Source Manager'da canlı kaynak düzenleme yeteneği farklıdır. Bu profil `CITATION` varmış gibi sunulmaz. Word taşıyıcıyı kaldırır veya ilişkiyi bozarsa güncel görünür metin sessizce eski havuzla yeniden üretilmez; dosya korunur ve açık destek sınırı verilir.
2. **Native Word alanları:** kaynak parçası, `CITATION` kümeleri ve `BIBLIOGRAPHY` ağacı birlikte yazılır; destekli ilk native küme tek/çok kaynak ve belgelenmiş locale/prefix/suffix switch'leridir. Locator switch'leri ve tür alanları gerçek fixture'la eşlenmeden başarı kapsamına alınmaz. Kaynak tag/GUID değişirse uygulama kimliği ancak sağlam taşıyıcı ve native grafikle korunur. Yinelenen tag, eksik kaynak, nested/cross-paragraph alan, desteklenmeyen kaynak türü/switch veya kısmi taşıyıcı tahminle düzleştirilmez.

Biçimlendirilmiş kopyanın uygulama→DOCX→uygulama kaynak/küme döngüsü A6 kabul kapısındadır. Native Word alan profili ayrı kapıdan önce genel seçenek olmaz. Kaynağın bilinmeyen native alanlarını koruma ve düzenleme izin listesi ayrıdır; bilinmeyen alanı kaybederek editable başarı sayılmaz.

CSL APA 7 ile Word'ün menüsündeki yalnız `APA` adı aynı uygulama/sürüm değildir. Paket cache'inin doğru olması, Word Online görünümünün ve Word alan yenilemesinin aynı sonucu verdiğini göstermez. A5'te görüldüğü gibi bu üç kanıt ayrı tutulur; gerçek Word düzenle/indir/PDF karşılaştırması olmadan tam Word uyumu yazılmaz. Word'ün farklı stile açık geçişi uygulama tarafından eski stil olduğu varsayılarak geri alınmaz.

## Komut ve dosya sınırı

Önerilen saf çekirdek: `lib/document-bibliography.ts` (kaynak/küme doğrulama, indeks, komutlar), `lib/bibliography-format.ts` (CSL adaptörü ve snapshot), `lib/bibliography-docx.ts` (native part/alan taşıma), `lib/bibliography-i18n.ts`, `BibliographyDialog.tsx`. Stiller/locale'ler lisans/manifestleriyle ayrı varlıklardır. Dosya adları uygulama sırasında uyarlanabilir; ikinci model otoritesi kurulmaz.

Komutlar: `createSource`, `updateSource`, `deleteSource`, `insertCitation`, `updateCitation`, `deleteCitation`, `insertBibliography`, `setBibliographyConfiguration`, `navigateCitationSource`. Kaynağı silme UI'si kullanım sayısını gösterir; kullanılan kaynağı gizlice sileceği bir varsayılan yoktur. Dialog gerçek belge/kaynak/küme kimliğini yeniden doğrular; eski seçim pozisyonu kalıcı kimlik değildir. IME composition tamamlanmadan kaynak verisi/küme değiştirilmez. Ctrl/Cmd+Z/Y ana belge geçmişine gider.

## Uygulama sırası ve kabul

1. **A6.0 — motor/varlık spike'ı:** exact paket ve lisans metinleri; stil/locale hash manifesti; browser bundle boyutu ve offline yükleme; resmi CSL testlerinden seçili APA7/IEEE sonuçları. Ağ araması yok.
2. **A6.1 — v6 grafik:** v0–v5 geçişi, kaynak/küme doğrulama, atomik komutlar ve ortak clipboard planı. Eski belge/no-note regresyonları korunur.
3. **A6.2 — canlı formatter ve kaynakça projeksiyonu:** tüm küme sonuçlarını uygulama, paragraf/IEEE numara hizası, bölüm sınırları, immutable revision ve output kapısı.
4. **A6.3 — UI ve çıktılar:** kaynak/küme yönetimi, APA7↔IEEE stil değişimi, locale/unused politikası, EN/TR/FR/ZH/AR/RTL/mobil/readonly/IME, HTML/MD/RTF/TXT ve ortak PDF/baskı.
5. **A6.4 — DOCX sınırları:** biçimlendirilmiş kopyanın uygulama roundtrip'i; ardından native Word kaynak/alan profili ve gerçek Word Online düzenle/indir incelemesi. Destek matrisi her profil için ayrı yayımlanır.

Zorunlu odaklı fixture matrisi:

- Kitap, makale, web; aynı yazar ve yıl ama farklı başlık; aynı soyadlı farklı yazarlar; 1/2/3 ve çok yazar; kurumsal/literal yazar; editör; tarihsiz ve eksik alanlı kaynak.
- Çok kaynaklı küme; farklı locator/prefix/suffix; aynı kaynağın tekrarı; atıf sırasını değiştirme/silme; APA disambiguation/yıl harfi ve IEEE yeniden numaralama; cited-only/includeUncited; kaynak nesnesi anahtar sırasını değiştirme.
- Türkçe noktalı/noktasız I, Fransızca aksan, Çin/Arap adları ve karışık RTL/LTR başlık; locale'in UI dilinden bağımsızlığı; aynı desteklenen tarayıcılarda kararlı çıktı.
- Kaynak düzenlemesiyle eski kümelerin de güncellenmesi; aynı snapshot'ın tekrar biçimlendirilmesi; undo/redo; no-op render'in belgeyi değiştirmemesi; async eski belgenin sonucunun yeni dosyaya yazılmaması.
- Aynı/dış belge copy, trusted/untrusted cut ve ikinci paste; fragmanda iki kümenin tek kaynağı paylaşması; ID/DOI çakışmaları; template/duplicate ve sürüm geri yükle.
- Kaynakça birden çok sayfa/sütuna akar; son girdinin bölüm terminali olması; kaynakça+sonnot bitişik cache'leri; backspace/delete/join ve select-all replace; tablo içi atıflar; ana metin ile cache arasında metin kaybı/çoğalması sıfır.
- TOC/PAGEREF ve gerçek dipnotların kaynakça büyüyünce tekrar kararlı olması; aktif/aktif olmayan export; PDF okuma sırası, arama/kopyalama ve bağlantılar; her kaynakça girdisi yalnız bir görünür kopya.
- DOCX'te gerçek ilişkiler, kaynak havuzu ve citation cluster'larının birebir korunması; desteklenmeyen switch/tür/part/metadata için kaynak değiştirmeden ret; Word Online aç/görünüm/düzenle/indir kanıtı, kaynak hash'i ve bağımsız PDF referansı.

Bu matris bitmeden APA7/IEEE'nin tüm kaynak türleri, Word canlı alan düzenleme veya genel görsel birebirlik tamamlandı sayılmaz.
