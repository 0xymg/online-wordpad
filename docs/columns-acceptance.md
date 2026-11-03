# A3 sütun düzeni — kabul ve destek sınırları

3 Kasım 2026: yerel üretim derlemesi ve hedefli kabul kontrolleri geçti. Canlı yayın doğrulaması henüz tamamlanmadı. Gerçek uygulama kontrolleri `next build` ardından `next start` ile, geliştirme bayrağı olmadan ve kullanıcı belgelerinden ayrı tarayıcı oturumlarında çalıştırıldı.

## Uygulanan davranış

- Bölüm başına 1/2/3 eşit sütun, twip cinsinden aralık, ayırıcı çizgi ve paragraf yönünden bağımsız sütun sırası. Bölüm veya bütün belge kapsamında ayarlar tek işlemle geri alınır.
- Tek ProseMirror belge ağacında satır, sütun ve fiziksel sayfa akışı. Sürekli bölüm geçişindeki kapanan bant dengelenir; ölçülmüş Word örneklerindeki belge/sonraki-sayfa sonuna kendiliğinden dengeleme uygulanmaz.
- Gerçek sütun sonu, DOCX/HTML dönüşü, menü ve klavye komutu. Silme/geri alma ile işaretin semantiği korunur.
- Cetvel ve sekmeler geçerli sütunun genişliğini kullanır. Farklı kağıt boyutlarında ve %50/%100 yakınlaştırmada klavye geçişleri imlecin sütun içi yatay konumunu korur.
- Basit tablolar, rowspan grupları ve sınanmış düz kenarlıklı uzun hücre devamları; gerekli sütun/sayfa geçişlerinde tekrarlanan başlık. Kaynak hücreler çoğaltılmaz. Geçici çerçeve/başlık çizimi editörün dışında tutulur; seçim rengi çıktıya taşınmaz.
- Akış içi görsel, tek sol/sağ yüzen görsel, sayfaya bağlı görsel ve metin kutusu. Görsel bırakma hedefi fiziksel sayfa ve sütuna göre bulunur; güvenle temsil edilemeyen paragraf içi sayfa sınırına taşıma kaynak değiştirilmeden reddedilir.

## Gerçek Word karşılaştırması

Dört dondurulmuş Word Online kaynağı üretim uygulamasına alınıp PDF dışa aktarıldı. [Uygulama PDF'leri ve kaynak özeti](../fixtures/columns/app-pdfs/provenance.json) ile [ölçüm raporu](../fixtures/columns/app-pdfs/word-comparison.json) saklandı.

| Kaynak | Word / uygulama sayfaları | Doğru sayfa ve sütundaki işaretler |
| --- | --- | --- |
| Sütun genişlikleri ve son bölüm | 6 / 6 | 440 / 440 |
| Sürekli sütun değişimleri | 1 / 1 | 51 / 51 |
| Sütun ve sayfa sonları | 5 / 5 | 11 / 11 |
| Bölüm/paragraf RTL ayrımı | 3 / 3 | 13 / 13 |

Toplam 515 işarette kayıp, çoğalma veya yanlış fiziksel sayfa/sütun yok. Bu sonuç piksel eşitliği değildir. Uygulamanın PDF metin katmanında farklı gömülü fontlar kullanılıyor; rapordaki metin katmanı başlangıç farkları ayrıca saklanıyor ve görsel eşleşme puanı olarak sunulmuyor. Word referans profili ve sınanan terminal kesme/default aralık davranışları `fixtures/columns/` altında bulunur.

## Kabul kanıtları

| Alan | Kontrol |
| --- | --- |
| Model ve native koruma | 62 model/komut kontrolü; v1/v2→v3 göçü, gelecekteki sürüm koruması, kararlı kimlikler, undo ve aç/kaydet; duplicate native ayarlardaki uyumlu uzantıları birleştirme ve çakışmada atomik ret |
| DOCX | Sütun ayarları/kesmeler, bağlantılı ve biçimli kesme, geçmiş `sectPrChange` verisinin korunması |
| Gerçek arayüz | Sütun ayarları, iptal/geri alma, korunan ayarı açık dönüştürme, salt okunur görünüm, Arapça mobil düzen |
| Klavye / seçim | Doğrudan ve boş bölüm sınırlarında gerçek fare + Arrow Up/Down/Shift; %50/%100; kaynak değişmeden seçim; sentetik clipboard/composition kontrolleri |
| Tablolar | 40 ve 160 sözcük çifti içeren devam örnekleri; aynı hücrede sütunlar arası metin seçimi, farklı hücre seçimi, boş devam alanına yazma/undo, blur ve seçiliyken PDF; ikinci örnek iki fiziksel sayfa |
| Tablo veri güvenliği | Taşıma düğmesinin açıklaması ve dil değişince kaynak hücre sayısının değişmemesi; gerçek hücre yazımı ve geri alma |
| Görseller | Sütun 2/3'e gerçek sürükleme, model ile sayfa koordinatları, geri alma, güvensiz sınırda tüm kaynak JSON'unun aynı kalması; önceki görsel/metin kutusu kontrolleri |
| PDF / yazdırma | Ortak ölçülmüş görünüm; üst/altbilgi ve alanlar, karma kağıt boyutları, doğal tablo sayfalama, ekran/raster karşılaştırması; sayfanın en kenarındaki artwork; sütun içindeki sekme cetveli |
| Derleme | TypeScript, yeni modüllerin odaklı lint kontrolü ve üretim derlemesi |

Temel tekrar komutları: `check-columns-ui.cjs`, `check-columns-editor.cjs`, `check-column-mixed-paper-keys.cjs`, `check-column-ruler.cjs`, `check-column-images.cjs`, `check-column-table-live-bands.cjs` (`TABLE_WORD_COUNT=160` varyantı), `check-column-table-handle-mutation.cjs`, `check-column-page-artwork.cjs`, `check-columns-word.cjs` ve `scripts/compatibility/compare-column-output.py`. Mevcut `check-pdf-print.cjs` / `check-pdf-output.py`, görsel ve metin kutusu regresyonları da kullanıldı. Tarayıcı testleri `BASE_URL`, `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`; PDF incelemesi `PDF_PYTHON` ile taşınabilir biçimde çalıştırılır.

## Açık sınırlar

- Eşit olmayan veya destek dışı native sütunlar, fazla geniş/yüksek nesneler, desteklenmeyen tablo boyaması/iç içe nesneler, güvenle kesilemeyen başlık/hücre yapıları ve örtüşen yüzen görseller tanı üretir. Kaynak korunur, görünür doğal düzen geri dönüşü gösterilir; tamamlanmamış yerleşim PDF başarısı gibi sunulmaz.
- Her Word belgesi için tipografik veya tablo yerleşimi eşitliği kanıtlanmadı. Ölçülmeyen terminal bölüm/kesme kombinasyonları genel Word varsayılanı sayılmıyor.
- Gerçek işletim sistemi IME testi yapılmadı; composition doğrulaması sentetik. PDF Arapça `/ActualText` içeriği var, fakat bazı metin çıkarıcılar bunu kullanmadığından bütün okuyucularda kopyalama/arama eşdeğerliği iddia edilmiyor.
- A4 canlı referanslar/içindekiler, A5 notlar, A6 kaynakça ve A7 ileri uyumluluk bu paketin tamamlanmış özellikleri değildir.
