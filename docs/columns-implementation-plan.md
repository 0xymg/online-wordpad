# A3 — Eşit sütunlar için uygulama tasarımı

Durum: A3 uygulaması ve yerel üretim kabulü tamamlandı; canlı yayın doğrulaması bekleniyor. Nihai destek sınırları, gerçek Word karşılaştırması ve test kanıtları [columns-acceptance.md](columns-acceptance.md) içinde. Aşağıdaki metin onaylı kapsamın tasarım kaydıdır; bütün Word belgeleri için görsel eşitlik iddiası değildir. Dört gerçek Word Online PDF referansı ve kaynakları donduruldu; ölçümler [columns/REFERENCE_REPORT.md](../fixtures/columns/REFERENCE_REPORT.md) içinde.

## Amaç ve başlangıç sınırı

İlk ürün kapsamı bölüm başına 1/2/3 eşit sütun, tamsayı twip aralık, ayırıcı çizgi ve gerçek sütun sonudur. Bölüm kimlikleri, metin, not/alan yer tutucuları ve nesne bağlantıları belge sırasını korur. Sayfalar/sütunlar belge ağacına çoğaltılmış içerik olarak yazılmaz. Editör, salt okunur çıktı, PDF ve yazdırma tek ölçülmüş yerleşimi kullanır. Eşit olmayan özel sütun genişlikleri korunacak native veri olabilir; ilk düzenlenebilir kapsam değildir.

Bugünkü koddan çıkan gereklilikler:

- `paginationPlugin.ts::computeLayout`, tek `pageStart/pageContentH` ve artan Y koordinatıyla çalışıyor. `findLineSplit` doküman pozisyonu ile çizilen Y'nin aynı yönde ilerlemesini varsayıyor. Aynı sayfanın ikinci sütunu yukarıdan başladığında bu varsayım bozulur; yalnız sütun CSS'i eklenip mevcut arama korunamaz.
- `documentSections` kimlikli bölüm aralıklarını ve sayfa geometrisini veriyor. `sectionBlockStyle` bugün tam bölüm metin genişliğini hesaplıyor; A3'te etkin sütun içerik genişliği ayrıca gerekir.
- A2 tab ölçümü içerik başlangıcına ve kullanılabilir genişliğe bağlıdır. Sütun genişliği tab/alan satırlarını değiştirir; tab ölçümü ile sütun planı birlikte kararlı hale gelmelidir.
- Mevcut tablo satır/rowspan grubu, tekrar eden başlık ve uzun hücre devam mantığı yararlıdır. Sayfa yerine sütun bölgesine de ilerleyebilmelidir; bu algoritma bağımsız ikinci PDF motorunda tekrar yazılmaz.
- Sayfaya bağlı görseller/metin kutuları, paragraf bağlantısının fiziksel sayfasını kullanır. Sütun numarası fiziksel sayfa numarasının yerine geçmez.
- A0 `columns`, `table-columns` ve `mixed` örneklerinde native `w:cols` iki sütun, 720 twip aralık ve ayırıcı çizgi içeriyor. A0 raporu sütun render desteğinin bulunmadığını gösteriyor; referanslar başarılı A3 sonucu olarak sunulmaz.

## Önerilen tek-editör mimarisi

Bir ProseMirror `EditorView` ve bir kanonik belge korunur. Önerilen yol, doğal sütun genişliğinde ölçümden sonra açık bir **sayfa/bölge/sütun/fragman planı** üretmektir. Sadece CSS `columns` nihai çözüm değildir; editable DOM'u sütunlar arasında yeniden ebeveynlemek veya her sayfa için ayrı editör oluşturmak da bu tasarımın parçası değildir.

1. **Doğal ölçüm:** önceki yerleşim dekorasyonları/offset'leri ölçümden çıkarılır. Paragraf, liste ve tablo metni hedef sütun genişliğinde, kendi font/biçim/tab ayarlarıyla ölçülür. PM pozisyonu → doğal satır/atom/satır grubu haritası çıkarılır. Ölçüm görünür belgeyi geçici küçültüp scroll konumunu bozmaz; offscreen ölçüm kopyası gerekiyorsa salt okunur, inert, `aria-hidden` olur ve HTML ID'leri temizlenir.
2. **Akış çözümü:** doğal birimler belge sırasıyla sınırlı bölgelerden geçirilir. Bölge kullanılabilir sayfa bandı ve sütun dikdörtgenlerinden oluşur. Çözüm metni değiştirmez; her fragmanın kaynak aralığını, fiziksel sayfasını, sütununu ve çizim dikdörtgenini üretir.
3. **Tek DOM'a uygulama:** tam bloklar node dekorasyonuyla yerleştirilir. Sütun/sayfa arasında bölünen paragrafın kaynak aralıkları inline dekorasyonlarla aynı sütun genişliğindeki doğal akıştan hedef fragman konumuna kaydırılır. Karakterler ve mark'lar bir kez bulunur; ikinci editable metin katmanı yoktur. Liste işareti, paragraf arka planı/kenarlığı ve devam sınırı ayrı dekorasyon gerektiriyorsa kaynak metin kopyalanmaz.
4. **Koordinat doğrulaması:** seçim için kullanılan gerçek DOM kutuları hedef konumda olmalıdır. `coordsAtPos` ve `posAtCoords` ile ölçülen PM geometrisi esas alınır; sadece başka yerde çizilmiş bir canvas/pseudo görüntü yeterli değildir. Fragman indeksi ölçüm, bölge bulma ve scroll için yardımcıdır; yanlış native seçimi üstünü örtmek için kullanılmaz.
5. **Tek çıktı:** aynı plan ve dekorasyonlar salt okunur PM görünümüne uygulanır. `preparePrintLayout` fiziksel sayfayı bu DOM'dan kırpar; PDF'nin görünmez metin katmanı ve bağlantıları da aynı gerçek metin kutularından çıkarılır.

PDF metin katmanında karma Arapça/Latin kaynak sırası ve karakter konumları izole testte doğrulandı; Arapça aralıklar mantıksal metni PDF `ActualText` ile de taşır. `pypdf.extract_text()` bu alanı kullanmayıp ayrı konumlandırılan Arapça karakterler arasına satır sonu ekliyor. Bu nedenle tüm PDF okuyucularında Arapça kopyalama ve arama eşdeğerliği henüz doğrulanmış değildir; okuyucuya özgü kabul ayrı kanıt ister. Bu bulgu sayfa görselinin doğruluğu olarak sunulmaz.

İzole prototipte gerçek PM koordinatları ve native etkileşim kapısı 84/84 kontrolden geçti; kanıt [prototip raporunda](columns-prototype-evidence.md). Bu kapı, üretim belgesi entegrasyonunu veya gerçek OS IME davranışını tek başına doğrulamaz. Üretim uygulamasında aynı seçim ve koordinat doğruluğu tekrar sınanır. Kök ajanla mimari tekrar incelenir; çoklu editör veya seçilemeyen görsel kopya otomatik yedek çözüm kabul edilmez.

## Geçici yerleşim sözleşmesi

Planın önerilen çıktısı, mevcut pagination plugin durumunun genişletilmesidir; kalıcı belge metadata'sı değildir:

```ts
type FlowRegion = {
  pageIndex: number;
  sectionId: string;
  bandTop: number; bandHeight: number;       // CSS px, zoom öncesi
  direction: "ltr" | "rtl";
  columns: Array<{ index: number; x: number; y: number; width: number; height: number }>;
};
type FlowFragment = {
  from: number; to: number;                 // PM kaynak aralığı
  pageIndex: number; regionIndex: number; columnIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  kind: "text" | "block" | "tableRows" | "tableCellContinuation";
  continuation: boolean;
};
type FlowLayout = {
  pages: RenderedPage[]; regions: FlowRegion[]; fragments: FlowFragment[];
  complete: boolean;
  diagnostics: Array<{ code: string; from: number; to: number }>;
};
```

Sayfa dizini fiziksel sayfayı, sütun dizini o bölgenin okuma sırasını gösterir. Ekrandaki sağ/sol konum ile okuma sırası ayrı tutulur. Gerçek Word probunda paragraf bidi tek başına sütun sırasını çevirmedi; bölüm `w:bidi=1` iki/üç sütunda sağdan sola ilerledi. Bölüm yönü sürüm 3 kaydında paragraf yönünden ayrı yönetilir; geçersiz native değer korunmuş durumdur. LTR prototipinin geçmesi üretim RTL desteği sayılmaz. ProseMirror transaction mapping, değişmiş kaynak aralıklarını yeniden ölçüm için geçersizleştirir. Eski plan yalnız aynı immutable belge/ölçü/font sürümüyle kullanılabilir. Export `complete:false` veya kararsız ölçümü başarılı çıktı gibi sunmaz.

Önerilen ortak API'ler: `flowRegionAtPoint(view,x,y)`, `flowRegionAtPos(view,pos)`, `contentGeometryAtPos(view,pos)` ve `flushDocumentLayout(view)`. A2 `tabContentGeometry`, cetvel ve görsel bırakma hedefi bu içerik geometrisinden yararlanır. Sayfa ortasını hesaplayan eski yardımcıları yalnız X'e sütun ekleyerek çoğaltmak yerine bu ortak haritaya bağlamak gerekir.

## Model, göç ve native koruma

A3, yeni sütun semantiğini eski okuyucuya sessizce kaybettirmemek için model sürümü 3 gerektirir. 1/2 → 3 belge ve bölüm kimliklerini, sekmeleri, kaynak XML'i ve bağlantıları korur. Geçerli eski kayıtta sütun yoksa tek sütun atanır. Bilinmeyen gelecek sürümün kaynak/otomatik kayıt koruması devam eder.

Önerilen bölüm alanı:

```ts
type SectionColumns =
  | { kind: "equal"; count: 1 | 2 | 3; space: number; separator: boolean }
  | { kind: "preserved"; reason: "unequal" | "unsupported-count" | "invalid-native" };
```

Eşit durumda genişlik `(kullanılabilirMetinGenişliği - (count-1)*space)/count` olur. Ayarlar sonlu, tamsayı ve negatif olmayan aralıkla doğrulanır; her sütuna en az 720 twip metin genişliği bırakılır. Yeni çok sütunlu ayarın başlangıcı 720 twip'tir. Eksik `w:num` bir, eksik `w:equalWidth` true kabul edilir; ayrı gerçek Word Online probunda iki eşit sütundaki eksik `w:space`, açık 720 ile aynı, açık 0'dan farklı sağ sütun başlangıcı verdi ([ölçüm](../fixtures/columns/defaults/MEASUREMENT.md)). Bu gözlem her Word sürümü ve belge kombinasyonuna genellenmez.

`preserved` durumunun özgün `w:cols` XML'i mevcut `rawProperties` kaynağında kalır; ikinci bir ham kopya eklenmez. Native eşit olmayan `<w:col>` listesi veya destek dışı sütun sayısı otomatik eşit sütuna çevrilmez. UI düzenleme sınırını ve görünüm farkını açıkça gösterir. Kullanıcı açıkça desteklenen eşit düzene dönüştürmedikçe DOCX'te özgün sütun XML'i korunur. Bu durumda fallback görünüm “Word ile eşleşti” sayılmaz.

`setSectionColumns(state,sectionId,settings)` ve bütün belge kapsamı tek transaction olmalıdır. Mevcut bölüm sınırı/kimliği yeniden üretilmez. Native export yalnız yönetilen eşit `w:cols` değerlerini yazar; diğer `sectPr` özellikleri ve ilgisiz compatibility ayarları korunur. Native import/export testi `num/space/sep/equalWidth`, bilinmeyen attr ve eşit olmayan alt `<w:col>` kayıtlarını ayrı doğrular.

### Gerçek sütun sonu

Önerilen `column_break` satır içi atomu paragrafı veya yazıyı çoğaltmaz. HTML'de öncelikli `br[data-edtr-column-break]`, native DOCX'te `w:br w:type="column"` ile taşınır. Plain text/Markdown'ın sütun düzeni yoktur; açıkça newline karşılığı kullanılır. UI'deki kesme işareti dekorasyondur ve baskıya girmez.

Solver bu konumda sonraki sütuna, son sütundaysa sonraki fiziksel sayfaya ilerler. Gerçek Word kontrolünde tek sütundaki column break yeni fiziksel sayfaya geçti; iki sütundaki column break sağ sütuna, page break sonraki sayfanın ilk sütununa geçti. Önceki referansta iki sütunun ilkindeki son column break boş altıncı sayfa üretmedi. Ayrı terminal problarında tek sütundaki ve iki sütunun sonuncusundaki column break, Word PDF'sinde görsel olarak boş ikinci sayfa üretti ([ölçüm](../fixtures/columns/terminal-controls/MEASUREMENT.md)). Bu ayrım solver'da gözetilir; ayrı tek sütunlu terminal page-break kontrolünde ise PDF yalnız bir sayfaydı. Kesme silmek tek editör konumudur; undo geri getirir. İçe aktarılan sütun sonu generic satır sonuna dönüşüp anlamını kaybetmez. İlk ekleme komutu gövde paragrafı/başlıkta güvenle çalışır; tablo hücresi ve metin kutusunda destek kanıtlanana kadar açıkça reddedilir. Liste içi ekleme, üretim davranışı ayrıca kanıtlanana kadar reddedilir.

## Akış, bölme ve dengeleme politikası

- Normal akış bölgenin ilk mantıksal sütununda başlar, sıradaki sütuna ve sonra sayfaya geçer. Fiziksel sıralama bölüm bidi özelliğinden ayrı tutulur; paragraf metin yönünden türetilmez.
- Paragraf bölünebilir; kaynak aralıkları satır başlangıçlarında kesilir. `keepNext`, `keepLines`, widow/orphan ve bölünmez nesne kuralları mümkünse aynı sütunda tutulur. Bir birim sütun yüksekliğinden uzunsa sonsuz ileri atlama yerine ölçülebilir devam veya açık taşma tanısı üretir.
- Sert sayfa sonu kalan sütunları kapatıp sonraki fiziksel sayfaya ilerler. Sert sütun sonu yalnız sıradaki bölgeyi açar. Bu iki belge nesnesi birbirine dönüştürülmez.
- **Her son bölgeyi dengeleme varsayımı kaldırıldı.** Gerçek `column-widths-balance` referansında next-page ile biten uzun iki sütunlu bölümün son sayfası yalnız ilk sütunda kaldı; belge sonundaki kısa üç sütunlu bölüm de dengelenmedi. `continuous-column-changes` referansında sonraki continuous değişiminden önce kapanan iki sütunlu B/D bantları 7/7 ve 6/6 satır olarak dengelendi; son üç sütunlu E bandı yine ilk sütunda kaldı. İlk aday politika bu ölçülmüş ayrımı korur: sequential fill temelidir; aynı sayfadaki continuous geçişten önce kapanan bant için dengeleme eklenir. Ölçülmeyen kesme/keep/compatibility kombinasyonları genel Word varsayılanı diye sunulmaz.
- Dengeleme aynı genişlikteki ölçülmüş birimleri daha kısa ortak bölge yüksekliğine tekrar yerleştirir. Arama sınırlı ve deterministik olur; boyut/hata toleransı ile kararlı kesme dizisi birlikte kontrol edilir. Font/tab/keep kuralı nedeniyle sabit noktaya ulaşılamaması “yaklaşık tamam” sayılmaz. Yalnız toplam yüksekliği sütun sayısına bölmek veya metni ortadan kesmek yeterli değildir.
- Aynı sayfa boyutundaki **sürekli bölüm ve sütun değişimi** için ölçülmüş aday politika: önceki bölümün son bandını kapat; sonraki bölüm sayfanın tam metin genişliğinde o bandın altından yeni sütun bölgesi açar. Referanstaki 1→2→1→2→3 tek sayfada kaldı; iki sütunlu kapanışlar dengelendi. Yer yetmeyen geçiş henüz bu kaynakta ölçülmedi; yeni sayfa açma kuralı ayrı kanıt ister. Bu tasarım kararı, mevcut tek sütunlu continuous marjin davranışının yerine tahminle geçirilmez.
- Ayırıcı çizgi yalnız dolu metin sütunlarının sayısından türetilemez. Word B/D continuous bantlarında çizgiyi kullanılan bant yüksekliğinde çizdi; son kısa üç sütunlu bölgede çizgi yoktu. Sonu column break olan iki sütunlu kontrolde sağda metin olmamasına rağmen çizgi vardı. Solver açık kesmeyle etkinleşen boş sütunları da izler; tam genel çizgi kuralı bu dört kaynakla kanıtlanmış sayılmaz.
- Dört kaynakta compatibilityMode=15 var; bütün Word XML parçalarında `doNotBalanceTextColumns` veya başka “balance” elementi/attr değeri yok. Bu yokluk kaynak profilinin bir olgusudur; bütün Word belgelerinin varsayılan davranışına genellenmez. Bilinmeyen compatibility/raw özellikler korunur.
- Kağıt boyutu değişimi mevcut A1 gibi yeni fiziksel sayfa açar. Üst/altbilgi ve sayfa numarası fiziksel sayfaya aittir; her sütunda yeniden çizilmez veya NUMPAGES sütun sayısını saymaz.

## Tablo, görsel ve metin kutusu sınırı

| Nesne | İlk uygulanacak davranış | Kayıp/taşma koruması |
| --- | --- | --- |
| Normal paragraf / liste | Sütun genişliğinde satırlar; devam fragmanı aynı kaynak aralıklarını kullanır. Liste işareti ilk fragmanda, numaralama belge sırasında kalır. | Metin ve işaret bir kez bulunur. Uzun liste öğesi mutlaka prototip ve kabul setindedir. |
| Otomatik genişlikli tablo | Mevcut TableMap, rowspan grubu ve tekrar başlık mantığını sütun bölgesine uygula. Sığmayan satır sonraki sütuna geçer. Uzun hücre devamı aynı fiziksel sayfanın sıradaki sütununa da çalışmalıdır. | Hücre birleşimleri/model satırları değiştirilmez; render devamları export modeline girmez. |
| Sabit geniş tablo | Yazılmış genişlik sütuna sığmıyorsa otomatik model küçültmesi yapılmaz. | Açık tanı/uyarı; sessiz kırpma veya komşu sütunun metnini örtme “destek” sayılmaz. Sütunları aşan tablo/shape ilk düzenlenebilir paket dışında kalabilir, kaynak korunur. |
| Akıştaki inline/topBottom görsel | Yüzde genişliği sütun içerik genişliğinden hesaplanır; orantı korunur. | Bölünmez artwork yeni sütuna geçer. Sütundan yüksek nesne için açık taşma durumu gerekir. |
| wrapLeft/wrapRight görsel | Sarma sınırı kendi sütunudur; mevcut float yüksekliği gerçek ölçüme dahil edilir. | Float resmi iki sütuna bölme. Float etrafındaki paragraf devamı ayrı testtir; kanıtlanmayan durum destek sınırı olarak gösterilir. |
| Sayfaya bağlı görsel / metin kutusu | X/Y fiziksel sayfa kenarından; katman ve metin düzlemi aynı kalır. Anchor fragmanın fiziksel sayfası kullanılır. | Bağlantıyı görsel sütun numarasından türetme. Sürükleme hedefi X/Y ile doğru sayfa/bölgeyi bulur; şimdiki yalnız-Y yakınlık yeterli değildir. |
| Dipnot/sonnot | A3 yeni not motoru eklemez; mevcut korunan içerik davranışı açıkça raporlanır. | A5 için sütun bölgesi ile fiziksel sayfa-altı not rezervi ayrı kavramlar tutulur. Henüz sayfa altı native dipnot eşleşmesi iddia edilmez. |

## PM seçimi, erişilebilirlik ve etkileşim kapısı

Belge ağacı ve erişilebilir okuma sırası değişmez. Ölçüm DOM'u gizli/inert olur; görünür metin her zaman tek kaynaktır. Kullanıcı tarafından görülen metnin üstünde ayrı etkileşimsiz bir çizim katmanı oluşturulmaz.

İlk prototip şu round-trip'i her fragman sınırında doğrular: `coordsAtPos(pos)` noktasından hit-test → aynı veya PM'nin izin verilen yan konumuna dönme; iki taraflı caret affinity ayrıca kaydedilir. Sol/sağ/yukarı/aşağı, Home/End, Shift seçimi, fare sürükleme ve kenarda autoscroll ölçülür. Mantıksal belge sırası ile fiziksel iki sütunun üst satırları karıştırılmaz. IME composition sırasında aktif metin DOM'u yeniden ebeveynlenmez; ölçüm/dekorasyon commit'i composing düğümü bozuyorsa ertelenir ve composition sonunda tek kararlı plana geçilir. Sentetik composition testi gerçek OS IME doğrulaması diye sunulmaz.

Kopyala/yapıştır HTML'si sütun dekorasyonlarını, mutlak çizim offset'lerini veya tekrarları içermez. Normal içerik paste'i bölüm ayarlarını hedef belgeye gizlice taşımamaya devam eder. Son fragmandaki Enter/Backspace/Delete, bölüm sınırını başka hiyerarşiye taşıyan işlemler ve undo/redo özellikle sınanır. Kullanıcının imleç/scroll ankrajı plan commit'inde korunur; A1/A2 scroll ve zoom regresyonları geçmelidir.

## Dar uygulama sırası ve durdurma ölçütleri

1. **A3.0 — koordinat/fragman kanıtı:** ürün menüsü veya model sürümü değiştirmeden, izole test belgesinde iki sütun/bir sayfa; bir uzun paragraf iki sütuna, sonra iki sayfaya taşsın. Karışık mark, gerçek tab ve bir uzun liste öğesi ekle. Tek editable DOM, gerçek caret/hit-test, seçim, IME/clipboard ve geçici layout'u kaydetmeme kanıtlanır. Başarısızsa sonraki adıma geçilmez; alternatif mimari iç incelemesine dönülür.
2. **A3.1 — bölge solver'ı:** 1/2/3 eşit sütun, fiziksel sayfa geçişi, hard column/page break, ölçülmüş continuous kapanış-bant dengelemesi ve continuous sütun değişimi. Belge/next-page sonu için otomatik dengeleme eklenmez. Henüz tablo/float gibi karma nesnelerle tam destek ilan edilmez. A0 basit columns fixture + dört hash'li gerçek Word referansı karşılaştırılır.
3. **A3.2 — kalıcı model/native/temel UI:** sürüm 3 geçişi, section column komutları, sütun sonu import/export, bölüm diyaloğu. Göç, iptal/undo, kaydet/aç, native raw koruma ve gelecekteki sürüm guard'ı doğrulanır. Bu adımda bile genel yayın kapısı A3 kabul setidir.
4. **A3.3 — yapısal içerik ve nesneler:** tablo satır/rowspan/uzun hücre, liste numaraları, inline/float/sabit görsel, metin kutusu ve header/footer. Geniş nesnelerin uyarı/preserve davranışı netleşir. A1/A2 mevcut regresyonlar çalışır.
5. **A3.4 — ortak çıktı ve Word raporu:** aktif/etkin olmayan belge, %50/%100 zoom, PDF/print okuma ve bağlantı sırası, native aç-kaydet-aç ve gerçek Word PDF ankrajları. Eşiklerin geçtiği örnekler ile bilinen farklar ayrı raporlanır. Sonra production build/yayın ve izole canlı test yapılır.

Bu adımlar kullanıcıya ayrı yeni kapsamlar olarak sunulmaz; onaylı A3 paketinin iç uygulama sırasıdır. Seçim ve paragraf fragmanı kanıtı çıkmadan yalnız “iki sütun görünen” bir UI yayımlanmaz. Teknik zorluk yüzünden sessiz metin kopyası, ikinci PDF sayfalayıcı veya modelde otomatik sayfa düğümleri eklenmez.

## Kabul örnekleri ve iş paylaşımı

Asgari fixture seti: 1/2/3 sütun, uzun tek paragraf, değişken font/mark + tab alanı, açık sütun sonu, son boş sütun/sondaki kesme, hard page break, kısa son bölgenin ölçülmüş dengelenmeme kontrolü, continuous 1→2→1 ve 2→3 kapanış dengelemesi, farklı kağıt boyutu, uzun liste, otomatik tablo, rowspan/uzun hücre, fazla geniş tablo, inline/float/sabit artwork, örtüşen metin kutusu, header/footer, bölüm/paragraf RTL ayrımı ve font hazır olmadan ölçüm. Her fixture sentetik marker sayısı ve karakter/nesne ilişkisi kontrolü taşır; kullanıcı belgesi kullanılmaz.

Her örnekte kayıp/çoğalma sıfır, native/source ilişkileri korunmuş, aynı PM pozisyonundan seçim doğru, undo tek işlem ve tekrar açma aynı model olmalıdır. Referanslı örneklerde fiziksel sayfa sayısı ve seçili sütun/metin ankrajları karşılaştırılır; font/Word profilinin bilinmeyenleri kaydedilir. Prototipin birkaç ankrajı geçmesi bütün karma belgelerin Word ile aynı olduğu iddiasına dönüştürülmez.

Kök ajan: mimari/koordinat kanıtı, şema ve ortak Editor entegrasyonu; Sol: model/sürüm/komutlar ve bölüm UI veri sözleşmesi; Terra: ölçüm/bölge solver'ı, native cols/break taşınması, PM geometri/Word/PDF testleri; UI ajanı: kanıtlanmış API üzerinden diyalog ve durum göstergesi. Paylaşılan pagination/PM dosyaları tek sahipte kalır. Referans DOCX kaynakları yakalanmış PDF/hash ilişkisiyle donduruldu; generator artık gerçek referans mevcutken yeniden üretmeyi reddeder. Yeni varyant yeni corpus/sürüm gerektirir. Native caret prototip kapısı geçildi; üretim geometrisi, düzenleme ve çıktı davranışları ayrıca doğrulanır.
