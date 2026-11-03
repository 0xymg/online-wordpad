# A4 — Canlı referanslar ve içindekiler

Durum: yerel uygulama ve seçili ölçümler mevcut; A4 yayımlanmadı ve kabul kapısı açık. A3 `2e1f550` ile canlıda doğrulandı. Bu paket onaylı `advanced-document-plan.md` sırasını izler. Sol referans modeli/kimlik/clipboard, Terra yerleşim ve native DOCX üzerinde çalışıyor; ana ajan arayüz, PDF bağlantıları ve entegrasyon kabulünü yürütüyor.

## Tek belge modeli

- Belge zarfı sürüm 4: eski bölüm/sütun kimlikleri korunur, hedef ve alan kimlikleri bir kez atanır. Gelecekteki sürüm sessizce açılıp kaydedilmez.
- Başlıklar ve açıklamalar `tgt_…`; yer imleri aynı kimlikli başlangıç/bitiş sınırları taşır. Alanlar `fld_…` kimlikli `reference_field` atomlarıdır. Hedef kimliği ile görünen metin/numara/sayfa önbelleği ayrıdır.
- Yinelenen, silinmiş veya yarım hedef yanlış başka hedefe bağlanmaz. Başlık adıyla ilişki tahmin edilmez.
- İçindekiler başlığı, yapılandırma taşıyan bir üst düzey paragraftır. Üretilen girişler sahip kimliğiyle bağlı üst düzey paragraflardır; başlık bağlantısı, gerçek sekme ve sayfa alanı içerir. Böylece mevcut satır/sütun/sayfa motoruyla birden çok sayfaya akar.
- Açıklama etiketi ve numarası gerçek satır içi içeriktir; yalnız CSS ile çizilmez. Numara alanı kendi açıklama hedefinin sıra numarasını gösterir.

## Güncelleme ve çıktı

`flushReferenceLayout` hedef metni/numarası ve içindekileri üretir, ortak sayfalamanın bitmesini bekler, hedef konumlarını fiziksel sayfa ve bölümün gösterim numarasına eşler, alanları yeniden hesaplar. Sınırlı yakınsama döngüsü başarısızsa çıktı başarı gibi sunulmaz. Kompozisyon ve eşzamanlı kullanıcı düzenlemeleri izlenir. Üretilen sonuç yenilemeleri ayrı undo adımı oluşturmaz.

PDF iç bağlantıları gerçek GoTo hedefleridir. Fiziksel sayfa konumu, çoğaltılmış baskı DOM kimliklerinden tahmin edilmez. Native DOCX uygulaması desteklenen bookmark aralıkları, REF/PAGEREF/SEQ/TOC alanları ve önbellek sonuçları için yerel olarak geliştiriliyor; desteklenmeyen biçimlerin korunması veya açık reddi ayrıca sınanıyor. Word’ün alan güncelleme davranışı ile uygulamanın otomatik güncellemesi ayrı kabul edilir.

## Kabul kapıları

1. Kimlik: yeniden adlandır/taşı/sil/split, duplicate ve yarım bookmark, aynı/dış belge kopyası, tek kullanımlı kesme belirteci, undo/redo, v3→v4 ve gelecek sürüm koruması.
2. Arayüz: bookmark/açıklama/referans/TOC oluşturma ve düzenleme, salt okunur koruma, mobil/RTL, hatanın görünmesi ve hedefe gitme.
3. Yerleşim: metin ve sayfa güncelleme, TOC seviye filtresi ve çok sayfa, 9→10/99→100 değişimi, karma bölüm numaralama ve sütunlar, kararlı sonuç ve durmayan döngünün açık hatası.
4. Native: supported basit/karmaşık alanlar, kimlikli bookmark aralığı, bozuk/eksik/yinelenen hedef, desteklenmeyen native verinin korunması veya kaynak değişmeden açık ret, aç/kaydet/aç ve gerçek Word karşılaştırması.
5. Çıktı: PDF’de doğru sayfa/sayı/metin ve iç hedef; DOCX gerçek alanlar; salt okunur/PDF/yazdırmada aynı güncellenmiş model.
6. Üretim derlemesi, odaklı regresyonlar, ardından coauthor olmadan commit/yayın ve canlı kabul.

Yerel kimlik, güncelleme/undo, 9→10 ve 99→100 sayfalama, çok sayfalı TOC, seçili sütun/tablo/RTL ve PDF GoTo ölçümleri `references-acceptance.md` içinde kayıtlıdır. Bunlar nihai üretim veya canlı kabul değildir. Yinelenen stil adları ve ilk girişten önce başlayan native alan düzeltildi; gerçek Word'de çok seviyeli TOC yenileme ve başlık değişikliği kaydoldu. Word'ün yeniden sıraladığı yer imi sınırları ve aynı etiketli açıklamaların yardımcı adları, indirilen DOCX ile gidiş-dönüş kontrolünde ayrıca ele alınıyor. İki gerçek Word dönüş dosyası son üretim derlemesinde aç/kaydet/aç kontrolünü geçti; canlı yayın kabulü henüz kapanmadı; A5–A7 tamamlandı sayılmaz.
