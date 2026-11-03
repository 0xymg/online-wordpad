# Bölümler, referanslar ve ileri Word uyumluluğu — onaylı geliştirme planı

**Durum: ONAYLANDI — 2 Kasım 2026. Kullanıcı kapsamı ve sırayı açıkça onayladı.**

Kullanıcının istediği üç başlığı kapsar. Mevcut görsel yerleşimi planının kalan işleri ayrı olarak sürer. Bu plandaki geliştirme, mevcut görsel/metin kutusu paketinin kapanışından sonra Sol/Terra alt ajanlarıyla başlatılır. İlk kapsam: eşit sütunlar, APA 7 + IEEE ve destek matrisiyle Word karşılaştırması. Kullanıcı referans uygulama olarak **Word Online** seçti.

## Hedef

Uzun ve karmaşık belgeleri bölüm bazında düzenlemek, referansları belge değiştikçe güncellemek ve desteklenen DOCX özelliklerini Word ile ölçülebilir biçimde uyumlu hale getirmek. "Her DOCX dosyası her Word sürümünde birebir görünür" gibi doğrulanamayacak bir söz yerine, açık bir destek matrisi ve Word referans çıktılarıyla kanıtlanan uyumluluk hedeflenir.

## Kodda görülen başlangıç durumu

- `lib/document-sections.ts` içe alınmış bölüm özelliklerinden sayfa geometrisi çıkarıyor; `lib/document-layout.ts` bölüm kenar boşlukları ve üst/altbilgi verilerini tutuyor. Genel amaçlı bölüm oluşturma/silme arayüzü ve düzenlenebilir sütun modeli henüz yok.
- Sayfalama ve PDF/yazdırma aynı ölçülmüş görünümü kullanıyor. Yeni sütun/dipnot yerleşimi bununla birleştirilmeli; ikinci, bağımsız bir PDF yerleşim motoru eklenmemeli.
- DOCX biçimlendirme akışı dipnot/sonnot parçalarını da okuyabiliyor. Bu, kararlı kimlikli düzenleme modeli, sayfa altında dipnot yerleşimi veya tam gidiş-dönüş desteğinin hazır olduğu anlamına gelmiyor.
- Menüde içindekiler ekleme ve belge alanı altyapısı mevcut; otomatik, sayfa numaralı, düzenleme sonrası kendini güncelleyen referans sistemi ayrı bir çalışma gerektiriyor.
- Paragrafın ham DOCX özelliklerinin korunması ile sekme duraklarının editörde gerçekten uygulanması ayrı yetenekler. İkisi bağımsız test edilecek.

## Önerilen sıra ve çıkış kapıları

| Paket | İçerik | Ön koşul | Tamamlandı sayılması için |
| --- | --- | --- | --- |
| A0 | Uyumluluk örnekleri, Word referans profili ve veri sözleşmeleri | Plan onayı | Destek matrisi, referans belgeler ve ölçüm raporu |
| A1 | Bölüm modeli ve bölüm düzenleyicisi | A0 | Bölüm ekleme/silme, yön/boyut/marjin kapsamı, güvenli DOCX döngüsü |
| A2 | Sekme durakları | A1 | Gerçek tab karakteri, hizalar/liderler, cetvel/diyalog, çıktı eşleşmesi |
| A3 | Çok sütunlu bölüm yerleşimi | A1–A2 | Sütunlar arası akış ve sayfalama, kesme, çıktı doğrulaması |
| A4 | Referans çekirdeği, çapraz referans ve canlı içindekiler | A3 | Kararlı hedef kimlikleri, güncellenen metin/sayfa alanları, tıklanabilir hedefler |
| A5 | Sonnot ve dipnot düzenleyicisi | A4 | Numaralama/bağlantılar; dipnotlar gerçek sayfa altında, taşma kayıpsız |
| A6 | Kaynak yönetimi ve kaynakça | A4; A5 ile ayrı dosyalarda ilerleyebilir | Yapısal kaynak verisi, atıf biçimlendirme, deterministik güncelleme |
| A7 | Karmaşık DOCX uyumluluk paketi | A1–A6 | Onaylı örnek setinde semantik ve görsel eşleşme raporu |

Sekme durakları, içindekilerin sağa hizalı sayfa numaraları ve noktalı liderleri için öne alındı. Sütunlar ve sayfalama kararlı hale gelmeden sayfa numaralı referansların tamamlandığı kabul edilmeyecek. Sonnot modeli, sayfa altında alan ayıran dipnot yerleşiminden önce doğrulanacak.

## A0 — Temel sözleşmeler ve referans seti

- Bölüm, başlık/hedef, not ve kaynak nesneleri için kararlı kimlikler; metin ekleme/silme ve kopyala/yapıştırda kimlik çakışması kuralları.
- Eski kaydedilmiş belgeleri açabilmek için sürümlü veri dönüşümü. Bilinmeyen DOCX özelliğini koruma, düzenleme ve render etme ayrı destek seviyeleri olarak kaydedilir.
- Başlangıç test seti: basit bölüm, karma yön/boyut, bağlı/bağımsız üstbilgi, sütun, tablo+sütun, sekme+liders, dipnot, sonnot, çapraz referans, TOC ve karma belge. Kullanıcı belgesi kullanılacaksa bir kopya üzerinden çalışılır.
- Word referans profili: **Word Online** (kullanıcının seçimi). Web sürümü zamanla değiştiği için karşılaştırma tarihi, tarayıcı/sürümü, kağıt ayarı ve kullanılan fontlar kaydedilir. Gerçek Word tarafından üretilmiş PDF referansları alınmadan "Word ile görsel eşleşti" sonucu yazılmaz.
- Önerilen ölçüm kapısı: içerik ve bağlantılarda sıfır kayıp/çoğalma; onaylı örneklerde sayfa sayısı aynı; başlık/alan/sayfa eşleşmesi doğru; aynı fontlarla seçili nesne ve metin başlangıçlarında 1 CSS px hedefi. İlk ölçüm raporunda bu eşiklerin gerçekçi olup olmadığı doğrulanır; başarısız örnek gizlenmez.

## A1 — Bölüm düzenleyicisi

İlk kapsam:

- İmleçte bölüm sonu: sonraki sayfa ve sürekli bölüm. Tek/çift sayfa başlangıcı ayrı alt paket; gereken boş sayfa davranışı tanımlanır.
- Geçerli bölümün görünür adı/numarası ve sınır işaretleri; sınır işaretleri baskıya girmez.
- Bölüme veya bütün belgeye yön, A4/Letter/Legal/özel boyut ve kenar boşluğu uygulama.
- Bölümü kaldırırken önceki/sonraki bölümün biçiminin hangi tarafa taşınacağı kullanıcıya açık olmalı; tek işlemle geri alınmalı.
- Bölüm ekleme/silme üst/altbilgi bağlantılarını, sayfa numarası başlangıcını ve bağlı görsel/metin kutularını yanlış bölüme taşımamalı. Mevcut indeks bazlı alanlar kararlı bölüm kimlikleriyle eşlenmeli.

Kabul: başa/ortaya/sona bölüm ekleme ve silme; portrait→landscape→portrait; yalnız bir bölümü değiştirme; üstbilgi bağlantısı; undo/redo; kaydet/aç; DOCX aç-kaydet-aç ve PDF/print sayfa geometrisi.

## A2 — Sekme durakları

- Paragraf/stil bazında sol, orta, sağ ve ondalık sekme; varsayılan sekme aralığı; noktalı/çizgili liderler ve temizleme.
- Cetvelde ekleme/taşıma/silme ve aynı veriyi kullanan sayısal diyalog.
- Tab karakteri boşluklara dönüştürülmez. Tablo hücresinde Tab ile hücre gezinme korunur; gerçek sekme için ayrı kısayol sunulur.
- Ondalık ayraç ve RTL/LTR davranışı açıkça tanımlanır; satır taşması sütun genişliğini kullanır.

Kabul: aynı durak için cetvel/diyalog eşleşmesi, orantılı fontlar, dar sütun, RTL, farklı ondalık ayraçlar, boş liderler, DOCX sekme özellikleri ve Word referans çıktısı.

## A3 — Çok sütunlu metin

- İlk sürümde bölüm bazında 1/2/3 eşit sütun, aralık, ayırıcı çizgi ve sütun sonu.
- Son sütunun dengelenmesi, sürekli bölüm geçişi ve sayfa sonu politikası önceden belirlenir.
- Seçim, imleç hareketi, kopyalama ve erişilebilir okuma sırası belge sırasını korur. Sadece CSS `columns` eklemek kabul sayılmaz; ProseMirror koordinatları ve sayfalama birlikte doğrulanır.
- Tablo, görsel, metin kutusu ve dipnot yerleşiminin sütun sınırıyla ilişkisi test edilir. Sütunları aşan nesneler için destek sınırı açıkça gösterilir; sessizce kırpılmaz.
- Eşit olmayan özel sütun genişlikleri ancak eşit sütun paketi kararlı olduktan sonra eklenir.

## A4 — Referans çekirdeği ve içindekiler

- Başlık, yer imi, şekil/tablo açıklaması gibi hedeflere kararlı kimlik; görünür etiket ile hedef kimliği ayrı tutulur.
- Çapraz referans ekle/düzenle: hedef metni, numarası veya sayfası. Silinen hedef açık bir "hedef bulunamadı" durumu üretir; yanlış başka hedefe bağlanmaz.
- TOC başlık seviyelerini seçer, bağlantı ve sağa hizalı sayfa numarası üretir. Kullanıcı tarafından yazılan metin parçası gibi sessizce bayatlamaz.
- Düzenleme sonrasında kontrollü yeniden hesaplama; dışa aktarma/yazdırma öncesinde tüm alanların güncellenmesi. Sayfa numarası değişimi yeniden satır kırılmasına yol açarsa sınırlı sabit noktaya ulaşma döngüsü ve kararlı sonuç testi.
- DOCX alan talimatları, önbellek sonuçları ve bookmark hedefleri birlikte korunur. Word'ün alan güncelleme davranışı ile editörün otomatik güncellemesi ayrı olarak test edilir.

Kabul: başlık ekle/yeniden adlandır/taşı/sil; sayfa eklenmesi; TOC birden fazla sayfaya taşması; 9→10 ve 99→100 sayfa numarası geçişi; kırık hedef; undo/redo; bağlantı ve numaraların PDF/DOCX eşleşmesi.

## A5 — Sonnot ve dipnot

- Ortak not modeli; belge/bölüm bazında otomatik numaralama, ekleme, düzenleme, silme ve metindeki işarete geri dönme.
- İlk alt paket sonnot: belge sonunda/bölüm sonunda toplanma; ardından dipnot: ilgili sayfanın altında gerçek alan ayırma.
- Not işareti ile not gövdesi birlikte taşınır/silinir/geri alınır; kopyalama yeni kimlik oluşturur.
- Uzun dipnotun devam sayfası, ayırıcı çizgi, referans satırının tek başına kalmaması ve sütunlu sayfada not alanı politikası tanımlanır.
- Dipnot yüksekliği sayfalamayı etkiler; not işaretinin başka sayfaya taşınması kararlı bir yerleşim çözümü gerektirir.

Kabul: aynı sayfada çok not, uzun not devamı, bölüm numaralama yeniden başlangıcı, dipnot/sonnot dönüşümü, silme/undo, karışık sütunlar, DOCX paket ilişkilerinin ve PDF okuma sırasının korunması.

## A6 — Kaynakça

- Yapısal kaynak havuzu: kitap, makale, web kaynağı; yazar, başlık, tarih, yayın/URL/DOI gibi alanlar; eksik alanları kullanıcıya gösterme.
- Metin içi atıf ve kaynakça aynı kaynağa bağlanır; kaynak düzenlenince ikisi güncellenir.
- Önerilen ilk stiller: APA 7 ve IEEE. Başka stiller veri modeli değil biçimlendirme katmanı üzerinden eklenir.
- Stil biçimlendirme motoru/lisansı araştırılıp belgelenir; el yazımı birkaç şablon tam stil desteği diye sunulmaz.
- Kaynakları internetten otomatik bulma/DOI arama ilk pakette yok; kullanıcı tarafından girilen bilgi üzerinde çalışılır. Kaynak uydurulmaz.

Kabul: aynı yazarlı/aynı yıllı kaynaklar, çok yazarlı ve kurumsal yazar, Unicode/RTL, eksik tarih, birden fazla atıf, kullanılmayan kaynak politikası, sıralama ve DOCX aktarımındaki düzenlenebilirlik sınırları.

## A7 — İleri uyumluluk ve sınırlar

Uyumluluk üç ayrı sonuç olarak raporlanır:

1. **İçerik/model:** metin, not, hedef, kaynak, bölüm ve ilişkiler kayıpsız mı?
2. **Düzenlenebilirlik:** Word nesnesi editörde ve geri aktarılan Word'de aynı işlevle düzenlenebilir mi?
3. **Görünüm:** onaylı font/Word profilinde sayfalar ve nesne koordinatları referansla eşleşiyor mu?

Alt paketler, örnek setindeki gerçek hatalara göre sıralanır: font ölçüleri/fallback, paragraf satır kırımı ve keep/widow kuralları, tablolar/satır devamı, yüzen nesne bağlantıları, bölüm/sütunlar, dipnotlar ve alanlar. Her düzeltme bir regresyon örneği ekler.

Tarayıcı ve Word'ün metin biçimleme/yerleşim farkları nedeniyle tüm karmaşık belgeler için koşulsuz birebirlik garanti edilmez. Desteklenmeyen/yalnız korunan özellikler kullanıcıya açıkça bildirilir. Makrolar, ActiveX, OLE, change tracking ve denklem motoru bu planın ilk kapsamına dahil değildir; dosya açarken bunlar çalıştırılmaz.

## Onay sonrası Sol/Terra iş paylaşımı

- **Sol:** belge modeli, komutlar, editör panelleri, not/alan/kaynak kimlikleri ve kullanıcı akışları.
- **Terra:** sayfalama/geometri, sütun ve dipnot alanı, DOCX okuma/yazma, Word/PDF karşılaştırma ve regresyon testleri.
- **Ana ajan:** arayüz/veri sözleşmelerini sabitler, dosya sahipliğini ayırır, entegrasyon ve yayın kabulünü yapar. Aynı paylaşılan dosya iki ajan tarafından kontrolsüz değiştirilmez.
- Bağımlılığı olmayan işler paralel yürür; her paket küçük, ayrı doğrulanan sürümler halinde yayımlanır. Belirtilen kabul testleri geçmeden paket tamamlandı olarak işaretlenmez.
- İlerleme dosyada "tasarım / uygulama / yerel doğrulama / canlı doğrulama" durumlarıyla tutulur. Süre tahmini A0 örnek ve ölçüm raporundan sonra verilir.

## Onaylanan kararlar

1. Sıra: A0 → A1 → A2 → A3 → A4 → A5/A6 → A7.
2. İlk kapsam: eşit sütunlar; sonnot ardından dipnot; APA 7 + IEEE; destek matrisiyle ölçülen Word uyumluluğu.
3. Önce mevcut görsel/metin kutusu işi kapanır; bu planın uygulaması ardından başlar.

Kullanıcı 2 Kasım 2026 tarihinde bu kapsamı ve sırayı onayladı. Görsel/metin kutusu paketi `a4b214f` ile canlıda doğrulanarak kapandı. A0 tamamlandı: sekiz sentetik belge için gerçek Word Online PDF referansları, SHA doğrulaması, uygulama çıktıları ve ölçüm raporu hazır. Sekiz örneğin tamamında en az bir uyumsuzluk ölçüldü; görsel birebirlik henüz değerlendirilmiş sayılmıyor. Ayrıntılar `docs/compatibility-baseline.md` dosyasında. A1 `2f6e8bd` ile yayımlandı; canlı bölüm arayüzü ve veri koruma testleri geçti. A2 `3a65144` ile canlıda doğrulandı. A3 `2e1f550` ile yayımlandı ve canlı kabulü tamamlandı.

## Kaynak notları

Yerel kod incelemesi yukarıda belirtilen mevcut yeteneklerin temelidir. Word dosyasında notların ayrı parçalarda tutulması ve alanların güncelleme davranışı için birincil kaynaklar:

- [Microsoft — WordprocessingML belge yapısı](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document): ana belge ve dipnot/sonnot gibi paket parçaları.
- [Microsoft — Alanları güncelleme](https://support.microsoft.com/en-us/word/update-fields): Word içinde alan güncelleme işlemleri.
- [Microsoft — İçindekileri güncelleme](https://support.microsoft.com/en-us/word/update-a-table-of-contents): sayfa numaraları ile başlık/metin değişikliklerinin güncellenmesi.


## Uygulama kaydı — A1

Bölüm düzenleyicisi `2f6e8bd` ile canlıda; yerel, gerçek Word ve canlı arayüz/veri koruma kontrolleri tamamlandı. Menü: **Insert → Section layout** veya **File → Page setup → Section layout**. Durum çubuğu geçerli bölümü gösterir; View menüsü bölüm sınırı işaretlerini açıp kapatır. İşaretler kaydedilen metne ve baskıya girmez.

- Sürüm 1 belge modeli, kararlı bölüm kimlikleri ve eski HTML verilerinin doğrulanmış dönüşümü eklendi. Bilinmeyen sürüm kaynak HTML'yi korur ve otomatik kaydı engeller; açıkça yeni belgeyle değiştirilirse özgün kaynak sürüm geçmişine alınır.
- Sonraki sayfa/sürekli bölüm, bölüm veya bütün belge kapsamında A4/Letter/Legal/özel ölçü/yön/marjin, önceki/sonraki biçimi seçerek sınır kaldırma ve tek işlemle undo/redo eklendi.
- Bölüme bağlı üst/altbilgi ve numaralama ayarları kararlı kimliklerle tutulur; mevcut indeks kullanan araçlara kontrollü izdüşüm sağlanır.
- Gerçek Word Online referansları `fixtures/section-editor/README.md` içinde. Uygulama çıktısı A4 dikey → Legal yatay örneğinde Word ile aynı sayfa sayısı ve 0,1 pt içinde sayfa ölçüleri verdi. Genel tipografik eşleşme iddia edilmez.
- İlk sürümde bölüm sınırı yalnız gövde paragrafı/başlık sonunda düzenlenir. Sınırı liste/tablo içine taşıyan işlem açık mesajla reddedilir. Tek/çift sayfa başlangıcı düzenleme, karmaşık yer imleri/alanlar ve tipografik uyumluluk sonraki ilgili aşamalardadır.
- Doğrulama: bölüm modeli/komutları, gerçek arayüz akışları, bilinmeyen sürüm veri koruması, native DOCX kimliği/geometrisi, mevcut bölüm/üstbilgi testleri ve görsel sürükleme/metin kutusu regresyonları. Mobil koyu tema ve Arapça RTL kontrol edildi.


A1 yerel kapanış: 37 model/komut kontrolü, kaynak veriyi koruyan gerçek açılış testi, bölüm arayüzü ve native kimlik/geometri testleri geçti. Üstbilgi ve mevcut bölüm testleri; görsel sayfalar arası sürükleme/metin kutusu regresyonları geçti. Sınır işareti satır yüksekliği ve kesintisiz bölüm zemin önbelleği sorunları regresyon testleriyle düzeltildi. TypeScript ve üretim derlemesi başarılı; mevcut Editor/MenuBar `any` ve eski hook lint bulguları bu değişiklikten bağımsızdır. Yeni modüllerin odaklı lint kontrolü temiz.


## Uygulama kaydı — A2

A2 `3a65144` ile yayımlandı ve canlı kabulü tamamlandı. Gerçek sekme karakteri/node, paragraf ve stil durakları, sayısal diyalog, sürüklenebilir cetvel, varsayılan aralık/ondalık ayraç ve ortak canlı/PDF/üstbilgi ölçümü eklendi. Model v2, eski uygulamanın yeni sekme bilgilerini sessizce düşürmesini engeller; v1 bölüm kimlikleri dönüşümde korunur. Ayrıntılı destek ve test durumu `docs/tab-stops-support.md` dosyasındadır. Canlıda tam arayüz/cetvel/mobil-RTL, klavye, DOCX metadata, üstbilgi undo ve dar hücre PDF kontrolleri geçti. İlk otomatik test yükleme bitmeden başlamıştı; test artık görünür yükleme katmanının kapanmasını bekler.

Gerçek Word referanslarıyla seçili LTR/RTL yatay ankrajlar, dar hücre satır grupları ve sekmesiz ondalık hücre hizası doğrulandı. Word'de düzenlenen DOCX özel ondalık ayraç bilgisini ve ilişkisiz özel özelliği korudu; bu metadata Word'ün bölge ayarı değildir. İçe alınmış tablo stili hücre boşlukları, üstbilgi tablo genişliği ve işaretli sekme run'ları düzeltildi. 38 sekme model kontrolü, 13 atom/pano kontrolü, cetvel/diyalog/stil taslağı, salt okunur kaynak koruması, klavye/üstbilgi undo, native koruma ve PDF testleri geçti. TypeScript ve üretim derlemesi başarılı. Bütün sayfa görsel eşitliği iddia edilmez.

Sonraki A3 uygulama devri `docs/columns-implementation-plan.md` içindedir. İlk kapı, tek ProseMirror belgesinde sütunlar arasında bölünen paragrafın gerçek imleç/seçim/koordinat kanıtıdır; bu kanıt çıkmadan sütun arayüzü yayımlanmaz.

## Uygulama kaydı — A3 (canlı kabulü tamamlandı)

`codex/equal-columns` dalında tek editör prototipi 84 etkileşim kontrolünü geçti. Model v3 geçişi, bölüm başına 1/2/3 eşit sütun, aralık/çizgi/yön ayarları, sütun sonu ve native DOCX koruma eklendi. Sütun sonunun biçim ve bağlantı bilgisi, eski bölüm revizyonlarının korunması ve silme/undo ayrı regresyonlarla doğrulandı.

Ürün editöründeki temel paragraf/liste/sekme akışı; gerçek fare seçimi, düzenleme/undo, çok sayfalı PDF ve tekrar tek sütuna dönüş testini geçti. Cetvel etkin imleç sütununu kullanır; baskı ve salt okunur dışa aktarma aynı yerleşim tamamlanmasını bekler. Tamamlanamayan düzen görünür mesaj verir ve PDF/yazdırmayı durdurur; kaynak metni değiştirmez.

Dört dondurulmuş gerçek Word örneği için uygulama PDF sayıları 6/1/5/3 olarak eşleşti. LTR ve RTL örneklerindeki 515 işaret kayıp/tekrar olmadan aynı sayfa ve fiziksel sütunda bulundu. Bu, bütün sayfa görsel eşitliği anlamına gelmez. Karışık RTL PDF metin katmanı ve dar sütundaki uzun sözcük kırılması düzeltildi; farklı PDF okuyucularında Arapça kopyalama/arama sınırları kabul raporunda tutuluyor. Üretim uygulaması PDF'leri, ölçüm ve kaynak özeti `fixtures/columns/app-pdfs` altında arşivlendi.

Üretim derlemesinde gerçek arayüz, model v3/gelecek sürüm koruması, native dönüş, RTL/cetvel, görsel ve metin kutusu regresyonları geçti. 40 ve 160 sözcük çifti içeren uzun hücre tablolarında gerçek metin/hücre sürükleme seçimi, boş devam alanına yazma/undo, tekrarlanan başlık ve seçiliyken PDF doğrulandı. İki fiziksel sayfalı örnekte içerik sayıları ve PDF işaretleri kayıpsızdı. Tablo taşıma düğmesi açıklamasının model değişikliğine yol açması, native duplicate uzantıların kaybı ve salt görünüm seçimlerinin baskıya taşınması düzeltildi.

**Yayın kabulü:** `2e1f550` canlıda; arayüz, veri koruma, native DOCX, uzun tablo/PDF, görsel/metin kutusu ve 515 işaretlik Word karşılaştırması geçti. Ayrıntılar [columns-acceptance.md](columns-acceptance.md) içinde. A4 canlı referanslar ve içindekiler paketi `c3f8a7e` ile yayımlandı; uygulama, PDF, native Word güncelleme/dönüş ve canlı kabul tamamlandı. Ayrıntılar [references-acceptance.md](references-acceptance.md) içinde. Güncel A5 durumu aşağıdadır; A6 ilk kapsamı `52293af` ile canlıda; A7.2 sütun/karma yerleşim paketi `b46b698` ile canlıda doğrulandı; A7 genel kabulü açık. [A7 planı](advanced-compatibility-plan.md).


## Uygulama kaydı — A4

Model v4, kararlı hedef/alan kimlikleri, bookmark ve açıklama komutları, metin/numara/sayfa referansları, canlı bağlantılı TOC ve ortak çıktı güncelleme kapısı `c3f8a7e` ile canlıda. Word Online'da alan yenileme/kayıt ve iki gerçek dönüş dosyasıyla aç/kaydet/aç doğrulandı. PDF GoTo bağlantıları, 100 sayfaya geçiş, çok sayfalı TOC, mobil/RTL, kaynak koruma ve native çıktılar canlı kontrolden geçti. Desteklenen alanlar ile korunan/reddedilen karmaşık native yapılar ayrı raporlanır. Yük altında tekil bir geçici hizalama gözleminin nedeni açık kaldı; üç ardışık tekil canlı ölçüm kararlıydı. Ayrıntı `references-acceptance.md` içindedir. Sonraki A5 sözleşmesi `notes-implementation-plan.md` dosyasındadır.

## A5a canlı kabul — 2026-11-03

`7258ccf` ile sonnot düzenleyicisi, v5 not havuzu, bölüm/belge sonunda gösterim, gerçek native DOCX sonnotları ve bağlantılı PDF çıktısı canlıya alındı. Sol/Terra geliştirmesi; coauthor eklenmedi. Word Online dönüş örneği ile kimlik/gövde/numaralama politikası koruması, kaynak koruma, bölüm sınırı undo ve belge değiştirme sırasında sabit çıktı doğrulandı. Canlı ekle/düzenle/sil/undo, rich DOCX aç/kaydet/aç ve iki sayfalı PDF testleri geçti. Ayrıntılar `notes-acceptance.md` içinde.

A5b `d97ea95` ile canlıda ve yayın kabulü tamamlandı. Dipnot oluşturma/içe aktarma/düzenleme/dönüşüm açıldı. Gerçek sayfa altı ölçüm/rezerv, 1/2/3 sütun, karma bölüm/genişlik, zengin metin, tablo hücresi sahipleri, geç yüklenen görseller/fontlar ve native Word dönüşleri doğrulandı. Canlı arayüz/history/dönüşüm ile Word dosyasını aç–DOCX indir–yeniden aç–PDF indir akışları geçti. Destek dışı karmaşık nesne/yerleşim sınırları `notes-acceptance.md` içinde açıkça tutuluyor. Sonraki A6 APA 7 + IEEE sözleşmesi [bibliography-implementation-plan.md](bibliography-implementation-plan.md) içinde; ilk kapsamı `52293af` ile canlıda ve yayın kabulü tamamlandı. Destek sınırları [bibliography-acceptance.md](bibliography-acceptance.md) içinde. A7 ileri uyumluluk bundan sonra gelir.


## A6 ilk kaynakça paketi — 2026-11-03

`52293af` ile v6 kaynak havuzu, APA 7 / IEEE canlı atıflar, kitap/makale/web kaynak yönetimi, çok kaynaklı kümeler, dil/locator ayarları ve biçimlendirilmiş DOCX aktarımı yayımlandı. Sol/Terra geliştirmesi; coauthor eklenmedi. Gerçek CSL işlemcisi ve sabitlenmiş çevrimdışı varlıklar, atomik clipboard/undo, bölüm ve not yerleşimi, mobil RTL, kaynak koruma ve canlı çıktılar doğrulandı. Word Online standart customXml çıktısını açıp düzenleyebiliyor; yeniden kaydederken değiştirdiği biçim temsili uygulamanın katı kaynak geri yüklemesinde reddediliyor. Native Word kaynak yöneticisi alan profili ayrı ve kapalıdır. Ayrıntılar [bibliography-acceptance.md](bibliography-acceptance.md) içinde.


## A7.1 — ilk ölçülen uyumluluk düzeltmeleri

Başlık altı tek çizgili paragraf sınırları (tema rengi, kalınlık, boşluk, kalıtım ve nil kaldırma), kaynakça için güvenli v3 XML normalizasyonu, sade eski DOCX açılışının korunması ve açıklayıcı kaynakça ret mesajları uygulandı. Sekiz donmuş Word örneği yeniden ölçüldü; sayfa sayısı/boyutu ve benzersiz işaretler eşleşiyor, fakat sekizinin de metin ankrajları hedef toleransı aşıyor. Bu A7'nin tamamlandığı anlamına gelmez. İlk paket `fd6dfb1` ile coauthor eklenmeden yayımlandı; üretim derlemesi ve canlı başlık çizgisi/kaynakça DOCX–çıktı–yeniden açma kontrolleri geçti. Güncel kanıtlar [advanced-compatibility-acceptance.md](advanced-compatibility-acceptance.md), sıralı sonraki işler [advanced-compatibility-plan.md](advanced-compatibility-plan.md) içinde.

## A7.2 — sütun ve karma belge yerleşimleri

Sol/Terra geliştirmesiyle Word otomatik satır aralığı, tablo stil kalıtımı ve girintisi, sütun sonundaki paragraf boşluğu, komşu paragraf boşluklarının birleşimi, sütuna bölünen tablo konumları ve ayırıcı çizgi uzunlukları düzeltildi. Yerel kabulde üç odak örneğinin tüm 26 işareti doğru sayfa/sütunda; karma belgenin dipnot sahibi doğru sayfada. Native içindekilerin kaynak yazı biçimi ve görünmeyen alan işaretçisi DOCX yeniden açılışında korunuyor. Sekiz belgenin beşi manifestteki ölçüm kapılarını karşılıyor; notlar/referanslar içeren üçü hâlâ fark gösteriyor. Genişletilmiş tüm işaretler için 1 CSS px kapısı açık; genel Word görsel eşitliği iddia edilmiyor. `b46b698` ile coauthor eklenmeden yayımlandı; üretim derlemesi ve canlı tablo, native içindekiler/DOCX, menü odağı ve kaynakça testleri geçti. Genel A7 kabulü açık. Ayrıntılar [advanced-column-compatibility-acceptance.md](advanced-column-compatibility-acceptance.md) içinde.
