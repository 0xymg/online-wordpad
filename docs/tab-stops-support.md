# A2 — Sekme durakları destek ve kanıt matrisi

Durum: A2 yerel kabulü tamamlandı; son renderer/native/UI regresyonları ve production build geçti. A2 yayın/canlı kabulü henüz tamamlanmadı. A1'in `2f6e8bd` canlı doğrulaması A2 sonucu değildir. Bu tablo, uygulamadaki düzenlenebilir veri, native DOCX koruması ve ölçülmüş Word görünümünü ayrı değerlendirir. Doğrulanmamış genel kombinasyonlar başarılı örneklere dahil edilmez.

## Referans profili

Referans uygulama Microsoft Word Online'dır. `fixtures/compatibility/tabs-leaders.docx` A0 örneği ve `fixtures/tab-stops/tabs-rtl-probe.docx` üzerinde gerçek Word **File → Export → Download as PDF** çıktıları kullanılmıştır. RTL probunun kaydı `tabs-rtl-probe.provenance.json` içindedir: yakalama tarihi 3 Kasım 2026 UTC; Codex uygulama içi tarayıcı; tarayıcı motorunun ve Word Online'ın kesin sürümü görünür değildir. Arial belirtilmiştir; gerçek font ikamesi bağımsız olarak doğrulanmamıştır. Kaynak ve PDF SHA-256 değerleri provenance dosyasındadır.

Dar hücre referansı `fixtures/tab-stops/narrow-wrap-probe.word.pdf` ve yanındaki provenance kaydıdır. Metadata kanıtı `decimal-metadata-probe.word-edited.docx` ile `decimal-metadata-probe.provenance.json` içindedir; bu dosya Word'de gerçek düzenleme ve native indirme sonrasında incelenmiştir. Metadata kanıtı PDF yerleşim ölçümü değildir.

Karşılaştırmalar seçili metin başlangıç/bitiş veya ondalık sınırı koordinatları içindir. 1 PDF pt = 4/3 CSS px dönüşümüyle seçili yatay ankrajlarda **1 CSS px altı** hedefi kullanılır. Bu sonuçlar bütün sayfanın, fontların, liderlerin çiziminin veya her satır kırılmasının görsel eşleştiği anlamına gelmez. A0'ın genel font/satır kutusu ve tablo boşluğu farkları ayrı kalır; tarihsel A0 sonuçları `compatibility-baseline.md` içindedir.

## Ölçülen ve doğrulanan kapsam

| Yetenek / örnek | Uygulama/model ve çıktı | Word referans kanıtı | Durum ve sınır |
| --- | --- | --- | --- |
| Gerçek sekme karakteri | Tek U+0009 karşılığı `tab` atomu; metin kod bloklarında literal kalır. HTML atomu, Markdown sekmesi, RTF `\\tab` ve native DOCX run sekmesi korunur. | Word tab run'ları örneklerden içe alınır. | Model ve native çıktı doğrulandı; tüm dış uygulama panoları için iddia yok. |
| Sol/orta/sağ/ondalık durak modeli | Tamsayı twip, konuma göre miras/override; doğrudan düzenleme ve stil kapsamı. | Aşağıdaki sınırlı LTR/RTL ankrajları ölçüldü. | Düzenlenebilir destek; genel Word eşitliği iddiası yok. |
| LTR sağ ve ondalık | `TABS_START`, `42`, `12.75` metinleri, iki sekme ve lider türleri korunur; %100 ve %50 zoom'da aynı model. | Sağ `42` bitişi Word'de 234,22 pt; `12.75` ondalık sınırı 378,05 pt. İki zoom'da uygulama farkı <1 CSS px. | `check-tabs-layout.cjs` geçti. |
| Karışık Arapça/Latin RTL | Latin rakam alanı öncesindeki RTL metin korunur. | Tek Word probunda sol/orta/sağ/ondalık satırlarının rakam başlangıçları sırasıyla 291,63 / 321,13 / 343,15 / 314,13 pt; farklar <1 CSS px. | Ölçülmüş sınırlı örnek; bütün RTL/bölge kombinasyonlarını kapsamaz. |
| İlk satır girintisi | Sağ sekmede sığmayan alanın sıfır ilerleme durumu. | Word probundaki sıfır ilerleme ile karşılaştırıldı. | Seçili prob geçti; her asılı/negatif girinti ve taşma durumu doğrulanmadı. |
| Ardışık/boş sekmeler ve otomatik ızgara | Metinsiz ardışık sekmeler kaybolmaz; varsayılan aralık belge verisidir. | Probun ikinci/üçüncü ankrajı 293,88 / 342,15 pt; fark <1 CSS px. | Seçili örnek geçti; dar örneğin ayrı kanıtı aşağıdadır. |
| Nokta ve çizgi lideri | Model `dot/dash`; DOCX çizgi lideri native `hyphen` olarak yazılır. | LTR örneğinin ankrajları ölçüldü. | Tür ve native enum doğrulandı; lider çiziminin piksel düzeyinde görsel puanı yok. |
| Birden çok metin biçimi ve RTL segment | Karışık mark'lar, seçim ve sekme yeri %100/%50 zoom'da sınandı. | Bu testin ayrı Word PDF referansı yok. | `check-tabs-mixed.cjs` geçti; uygulama regresyonu olarak raporlanır. |
| Üstbilgi sekmesi | İçe alınmış üstbilgide sağ durak/lider ve PDF kopyası kontrol edildi. | Ayrı Word ölçümlü bütün üst/altbilgi matrisi yok. | `check-tabs-header.cjs` ve genel `check-header-footer.cjs` regresyonu geçti. |
| Bilinmeyen native tür/lider | Paragraf ve stil `bar`/`middleDot` kayıtları dokunulmadan native çıktıda kaldı; özgün stil `pPr` korunur. | Koruma testi paket XML'ini denetler, görsel Word ölçümü değildir. | `check-tabs-native-preservation.cjs` geçti. Koruma var; bu türlerin editörde render desteği yok. |
| Varsayılan aralık | HTML/model/sürüm geçmişinde saklanır; `w:defaultTabStop` okunur/yazılır. | Native 900 twip aralığı import/export sonrasında kaldı. | Koruma testi geçti; EDTR varsayılanı 720 twip. |
| Karışık seçim, miras, clear/reset ve stil silme | Her seçili paragraf ayrı hesaplanır; clear konumu bastırır; reset yönetilen düzenlemeleri kaldırır. Stil silme kendi/devralınmış opaque sekme XML'ini somutlaştırır; undo kaynak grafı geri getirir. | Word görsel karşılaştırması değildir. | `check-tab-model.cjs` 38 kontrolle geçti; stil taslağı da saftır ve tek işlemle kaydedilir. |
| Diyalog, cetvel ve stil taslağı | Karışık iki paragraf, konum/hiza/lider, varsayılan aralık ve Arapça ayıraç; cetvel tıklama/sürükleme, tek undo, Escape, klavye odağı ve silme; kaydedilmemiş stil iptal/kaydet ve miras kontrol edildi. | Word görsel karşılaştırması değildir. | `check-tabs-ui.cjs` geçti. 390×844 İngilizce/Arapça koyu temada yatay taşma yok; RTL yönü doğru. Pano/metin iddiası bu UI testinden çıkarılmaz. |
| EDTR ondalık tercihinin DOCX metadata'sı | Uygulamaya ait standart özel özellik `EDTRDocs.TabDecimalSeparator`; ilişkisiz özellik, ilişki ve content-type kaydı korunur. | Virgül ve yabancı özellik gerçek Word Online düzenle → indir dosyasında kaldı. | `check-tab-decimal-metadata.cjs` uygulama import/export, virgül ve Arapça ayıraç gidiş-dönüşünü doğruladı. Word'ün bölgesel ondalık seçimini yönetmez. |
| Model sürümü / kaynak güvenliği | Sürüm 1 → 2 bölüm/belge kimliklerini korur; bilinmeyen sürüm kaynak HTML'yi değiştirmez. | Word referansından bağımsız veri sözleşmesi. | 39 bölüm/model kontrolü ve `check-document-load-safety.cjs` geçti. |
| Salt okunur belge koruması | Düzenlemeye kapalı belgedeki sekme UI/komutları kaynak üzerine yazmaz. | Word referansından bağımsız güvenlik regresyonu. | Readonly UI guard ve son tam diyalog/cetvel regresyonu geçti. |
| Dar hücre/paragraf satır kırımı | Sol/sağ/orta/ondalık alanların örnek satır grupları, seçilebilir metin ve yakınsama korunur; layout dekorasyonları kayda girmez. | Gerçek `narrow-wrap-probe.word.pdf` içindeki örnek satır grupları karşılaştırıldı. | `check-tabs-narrow.cjs` geçti; PDF üretimi/yakınsama da geçti. Keyfi bütün dar alanlar için garanti değildir. |
| Hücrede literal sekmesiz ondalık | Native decimal durağı olan hücreye geçici implicit ölçüm uygulanır; model metnine sekme eklenmez. Sol kontrol hücreleri etkilenmez. | Native Word hücre probu; normal ve ondalık kontroller ayrı tutuldu. | `check-tabs-decimal-cell.cjs` geçti; `tblPr` bulunmayan tablo dahil kaynak TableNormal 108 twip hücre marjinleri kullanılır. |
| Dar running header / çoklu durak kontrolleri | Aynı transient ondalık/satır kırımı kuralları running header kopyasında işler; sayısal kırılma diğer alanlara sızmaz. | Bu ek running header ve multi-stop kontrollerinin ayrı Word PDF referansı yok. | `check-tabs-running-narrow.cjs` ve `check-tabs-multistop.cjs` geçti; uygulama regresyonudur. |
| Yeniden ölçüm ve kalıcılık | Zoom/pencere değişimi transient bidi sarmalayıcılarını kaydetmez; tekrar açma metni korur. | Word referansından bağımsız regresyon. | `check-tabs-layout.cjs` içinde geçti. |
| PDF/print ve metin dışa aktarımı | Ölçülmüş belge DOM'u kullanılır; lider ve sekme parçaları çıktı kopyasında hazırlanır. | Yukarıdaki ankrajlar bütün PDF'nin eşleşmesi değildir. | PDF üretimi ve içerik kontrol edildi; tüm font/arama/kopyalama kombinasyonlarına genel garanti verilmez. |

## Bekleyen, sınırlı veya doğrulanmamış kapsam

| Konu | Mevcut kanıt | Açık kalan kabul |
| --- | --- | --- |
| Word bölgesel ondalık davranışı | Microsoft'un bölgesel sayı ayarı açıklaması ve sınırlı noktalı Latin rakam probu var. | Virgül, Arapça U+066B, Arap rakamları ve Word Online bölge kombinasyonları için ayrı yerleşim kanıtı yok. EDTR metadata'sı Word'ün bölgesel davranışını değiştirdiği iddia edilmez. |
| Genel tablo yerleşimi | Sentetik dar örnekteki fark, kaynağın TableNormal marjinlerinin 108 twip (yan başına 7,2 CSS px) olarak uygulanmasıyla düzeltildi. Tarihsel A0 raporu yerinde değiştirilmedi. | Start/end marjinleri, keyfi tablo stilleri ve diğer düzenler ayrıca doğrulanmadı; bu düzeltmeden genel tablo fidelity sonucu çıkarılmaz. |
| Diğer dar alanlar / son sekme kombinasyonları | Belirtilen Word örneği ve uygulama kontrol testleri geçti. | Başka fontlar, karma alan/hücre ölçüleri ve bütün sonda sekme/satır kırımı kombinasyonları için kapsamlı Word matrisi yok. |
| Sıra dışı native tür/lider | Ham XML korunur ve UI destek sınırını bildirir. | Bar, num/start/end gibi desteklenmeyen türler veya middleDot/underscore/heavy gibi liderler için render/düzenleme eşleşmesi yok. |
| Font ikamesi / lider görünümü / bütün sayfa | Belirtilen Arial ve seçili metin ankrajları var. | Kullanılan gerçek font, bütün lider çizgisi ve bütün sayfa görsel puanı henüz doğrulanmadı. |

## Ondalık ayıracı ve varsayılan ızgara birbirinden ayrıdır

EDTRDocs'un `layout.decimalSeparator` ayarı belge içindeki hizalama politikasını belirler. HTML ve sürüm geçmişinde kalıcıdır. `EDTRDocs.TabDecimalSeparator` özel özelliğinin Word tarafından korunması gerçek dosyada doğrulanmıştır; bu, Word'ün o ayıracı sekmelerde kullandığını kanıtlamaz. `w:decimalSymbol` alan değerlendirmesiyle ilişkili ayar, sekme motorunu yöneten bir alan gibi kullanılmaz.

Microsoft, ondalık sekmeler için ayıracı değiştirmeyi bölgesel sayı ayarlarıyla açıklar. Bu, EDTR'nin belge içi virgül/Arapça seçimini otomatik olarak Word Online'ın bölge ayarına çevirmemizi sağlamaz. [Microsoft: ondalık sekmeler ve ayıraç](https://support.microsoft.com/en-gb/word/use-decimal-tabs-to-line-up-numbers-with-decimal-points).

`w:defaultTabStop` ise otomatik aralığın native belge ayarıdır. Son özel duraktan sonra otomatik konumlar bu aralığın katlarıyla üretilir; alan yoksa 720 twip aralık tanımlanır. Özel durağın konumunu yeni ızgara başlangıcı saymak aynı şey değildir. [Microsoft Open XML: DefaultTabStop](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.defaulttabstop?view=openxml-3.0.1).

## Testleri yeniden çalıştırma

Model için `node scripts/check-tab-model.cjs`; bölüm/sürüm güvenliği için `check-section-model.cjs` ve `check-document-load-safety.cjs`; native/render için `check-tabs-layout.cjs`, `check-tabs-mixed.cjs`, `check-tabs-header.cjs`, `check-tabs-native-preservation.cjs`; dar alanlar için `check-tabs-narrow.cjs`, `check-tabs-decimal-cell.cjs`, `check-tabs-running-narrow.cjs`, `check-tabs-multistop.cjs`; metadata için `check-tab-decimal-metadata.cjs`; diyalog/cetvel/stil taslağı için `check-tabs-ui.cjs` kullanılır. Tarayıcı testleri varsayılan olarak `http://localhost:3107` kullanır; Playwright/Chromium yolları `PLAYWRIGHT_MODULE` ve `CHROMIUM_PATH` ile verilebilir. Tam uygulama regresyonları `BASE_URL` kabul eder; bağımsız model testlerinin başlangıç sayfası localhost'tur. Testler izole belgeler kullanır.

Bir scriptin bulunması başarılı çalıştırma kanıtı değildir. Bu matris yalnız yukarıda açıkça bildirilen sonuçları başarılı sayar. Yeni Word probu bittiğinde örnek, gerçek çıktı/provenance ve ölçüm sonucu birlikte eklenir; yayın/canlı sonucu ayrıca güncellenir.
