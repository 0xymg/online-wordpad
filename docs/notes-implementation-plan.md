# A5 — Sonnot ve gerçek sayfa dipnotu uygulama sözleşmesi

Durum: A4 canlı kabulü tamamlandı. A5 geliştirmesi `codex/document-notes` dalında sürüyor; yayın kabulü henüz tamamlanmadı. Onaylı [advanced-document-plan.md](advanced-document-plan.md) A5 kapsamını somutlaştırır. A5a sonnot önce doğrulanır; A5b gerçek sayfa dipnotu ardından gelir. Sonnotun yerel ve native kabul kapıları kapanmadan A5a yayımlanmış sayılmaz. Bu belge yeni ürün onayı istemez ve A5'in hazır olduğunu ileri sürmez.

## Mevcut kodun getirdiği sınırlar

- `lib/document-model.ts`: zarf sürüm 4; belge/bölüm kimlikleri ve bölüm havuzu var, not havuzu yok. `parseDocumentHtml` ve `migrateDocumentNode` bütün tam belge açılışlarında ortak kapı. `projectDocumentModel` bölüm sınırı ile kayıt kümesinin birebir eşleşmesini doğruluyor.
- `lib/document-identity.ts`: `nte_` kimliği ve `planDocumentIdentities` zaten var. Notlar için yeni numara tabanlı kimlik sistemi kurulmayacak.
- `lib/document-references.ts`: A4 clipboard eklentisi copy/cut/paste olayını kendisi tüketiyor. Ayrı bir not clipboard eklentisinin sonradan aynı olayı yakalaması yeterli olmaz; tek atomik fragman planı genişletilmeli.
- `lib/doc-import.ts`: DOCX, text-box → reference → formatting → Mammoth → ters restore zincirinden geçiyor. `docx-formatting.ts` native footnotes/endnotes parçalarındaki biçimleri ziyaret ediyor; bu işlem not işaret/gövde ilişkisini kanonik not modeline dönüştürmüyor.
- `app/components/paginationPlugin.ts`: tek sütun `computeLayout`, sütunlu belge `measureColumnDocument` → `solveColumnFlow` → `buildColumnDecorations` üzerinden ölçülüyor. İkisi de fiziksel `pages` çıktısını yayımlıyor. Dipnot rezervi her iki yola girmeli.
- `lib/print-layout.ts`: ölçülmüş editör host'unu kopyalayıp fiziksel sayfalara kırpıyor. `lib/pdf-snapshot.ts` bu sayfaları görsel olarak yakalıyor ve arama/kopyalama için görünmez Unicode metin katmanı yazıyor; okuma sırası yalnız raster görüntüden ibaret değil. `lib/readonly-document-view.ts` açık olmayan belgeler için aynı ProseMirror/sayfalama motorunu kullanıyor. Dipnotlar bu ortak ölçülmüş görünüme dahil edilmeli; bağımsız PDF veya baskı not yerleşimi eklenmeyecek.
- `lib/reference-layout.ts`: alanlar, TOC ve fiziksel sayfa sonuçları için sınırlı yakınsama kapısı var. Notlar gövde sayfalarını değiştirdiğinde PAGEREF ve TOC aynı son yerleşimden hesaplanmalı.
- `fixtures/compatibility/notes.docx`: hem footnote hem endnote native `1` içeriyor; bunlar ayrı nesneler. `-1` separator ve `0` continuationSeparator kayıtları kullanıcı notu değil. Mevcut fixture yalnız başlangıç örneğidir, uzun not veya doğru sayfa yerleşimi kanıtı değildir.

## Kanonik v5 veri modeli

A5a sürüm 5'i getirir. v0–v4 → v5 geçişi var olan belge, bölüm, hedef ve alan kimliklerini korur; not taşımayan belgeye boş not havuzu ve açık varsayılanlar ekler. Gelecek sürüm, bozuk model veya güvenli çevrilemeyen native not kaynak değiştirilmeden reddedilir. Eski bir düz HTML bağlantısı yalnız görünüşü Mammoth notuna benzediği için nota çevrilmez.

Önerilen TypeScript sözleşmesi:

```ts
type NoteKind = "footnote" | "endnote";
type NoteNumbering = {
  restart: "continuous" | "eachSection";
  start: number; // pozitif tamsayı
  format: "decimal" | "lowerRoman" | "upperRoman" | "lowerLetter" | "upperLetter";
};
type NotePolicy = {
  footnote: NoteNumbering & { placement: "pageBottom" };
  endnote: NoteNumbering & { placement: "documentEnd" | "sectionEnd" };
};
type NoteBodyJSON = { type: "doc"; content: unknown[] };
type NoteRecord = {
  kind: NoteKind;
  body: NoteBodyJSON; // doğrulanmış PM JSON; HTML veya bağımsız localStorage değil
  native?: {
    partUri: string;
    nativeId: string; // kaynak takma adı; uygulama kimliği değil
    rawProperties?: string;
  };
};
type DocumentModelV5 = {
  version: 5;
  id: DocumentIdentity<"document">;
  finalSectionId: DocumentIdentity<"section">;
  sections: Record<string, SectionRecordV5>;
  notes: Record<string, NoteRecord>; // anahtar geçerli ve benzersiz nte_…
  notePolicy: NotePolicy;
};
type SectionRecordV5 = SectionRecord & {
  notePolicy?: { footnote?: Partial<NoteNumbering>; endnote?: Partial<NoteNumbering> };
};
```

`unknown[]` depolama sınırının türüdür; kabulde `schema.nodeFromJSON`, `check()` ve açık düğüm/attr izin listesi zorunludur. Not gövdesi aynı paragraf/metin biçimlendirme, yön ve gerçek `tab` semantiğini kullanır. A5 ilk düzenlenebilir kapsam: paragraf, bullet/ordered list, list item, metin, hard break, tab ve desteklenen metin markları/dış bağlantılar. Gövde boşsa tek boş paragraf olarak normalleştirilir. Bölüm sonu, iç içe not, TOC, başlık/açıklama/bookmark tanımı, alan, tablo, görsel ve text-box bu ilk kapsamda oluşturulmaz. Native kaynak bunları içeriyorsa sessiz düzleştirme yapılmaz: ilgili belge açık hata ile korunur; kapsam genişletilmeden düzenlenebilir başarı sayılmaz. A4 nesneleri ana metinde aynen çalışmaya devam eder.

Ana metin şeması `note_reference` adlı satır içi, seçilebilir atom ekler. Kanonik kimlik `noteId`; `cachedLabel` türetilmiş numara önbelleğidir ve açılışta/işlemde indeksten yeniden üretilir. Gerçek DOM metni olarak tutulması, etkileşimsiz sütun ölçümünün de aynı genişliği kullanmasını sağlar. Sayfa konumu yerleşim çıktısıdır. Cache varsayılanı `…`; yüklemede/not işleminde indeksle yenilenir ve DOM'da gerçek superscript metin olarak yazılır. Salt okunur/sütun ölçüm görünümü de bu aynı metin genişliğini ölçer. HTML işareti `span[data-edtr-note-reference][data-note-id]`; tam HTML'nin `data-edtr-model` zarfı havuzu taşır. Superscript işareti CSS ile görünür, DOM metni erişilebilir numarayı da taşır; yalnız pseudo-element üretilmez. Atom içinde not gövdesi veya ikinci tür alanı saklanmaz.

İlk pakette bir not kaydının tek sahip işareti vardır. Tam yüklemede eksik gövde, sahipsiz kayıt, aynı not için birden çok sahip veya yanlış kimlik türü bozuk modeldir; ilk bulunan nota otomatik bağlanılmaz. Normal düzenlemede son sahibi silinen kayıt aynı işlem grubunda kaldırılır. Kesme aktarımı, silinen gövdeyi aktarım fragmanında tutar. İleri sürüm veya bozuk yüklemede önceki açık belge yeni dosyanın yerine otomatik kaydedilmez.

## Numaralama ve komutlar

`collectNoteIndex(doc)` yalnız kanonik ana metin işaretlerini belge sırasıyla tarar; `{noteId, pos, sectionId, kind, ordinal, label}` ve açık tanılar üretir. Fiziksel sayfa numarası not numarası değildir. Türlerin sayaçları ayrıdır. `eachSection` sahibi işaretin bulunduğu `sec_…` ile sıfırlanır; bölüm taşındığında/silindiğinde eski sıra indeksine bağlanmaz. Belge varsayılanı decimal, başlangıç 1, continuous; sonnot documentEnd ve dipnot pageBottom. Bölüm override'ı ilgili bölümde etkin politikadır. Değişik format veya başlangıç açıkça ayarlanabilir; sonradan düzenlenen native `eachPage`, custom mark veya desteklenmeyen format ilk sürümde açık destek dışıdır.

Saf yardımcılar ve komut sınırı:

```ts
collectNoteIndex(doc): NoteIndex;
validateNoteGraph(doc): NoteDiagnostic[];
insertNote(kind, body?): Command;
updateNoteBody(noteId, validatedBody): Command;
deleteNote(noteId): Command;
convertNote(noteId, kind): Command;
setNotePolicy(patch, scope, sectionId?): Command;
navigateNoteOwner(noteId): Command;
planNoteClipboard(slice, records, destination, provenance): NotePastePlan;
```

Not ekleme işareti ve kaydı tek transaction'da yazar. Silme/convert/policy ve gövde düzenlemesi ana editör geçmişine girer; ayrı bir not yerel geçmişi kalıcı belge geçmişinden kopmaz. Note editor kendi geçici seçimini taşıyabilir, fakat her kabul edilmiş gövde transaction'ı ana belgeye `setDocAttribute` ile yansır. Ctrl/Cmd+Z/Y odağı not editöründeyken de ana belge geçmişine yönlenir; IME composition bitmeden gövde değiştirilmez. Kaydetme, belge değiştirme ve odak kapatma bekleyen composition'ı güvenli sonuçlandırır veya işlem açıkça başarısız olur.

Gövde editörü `noteId` ile açılır; seçilen ana metin pozisyonu kimlik değildir. Ana belge undo/silme/restore sonucu not kaybolursa panel kapanır; stale içerikle yeniden kayıt oluşturmaz. İşarete tıklama notu açar, panelde “metne dön” sahibin güncel konumuna gider. Salt okunur görünümde gezinme vardır, mutasyon yoktur. EN/TR/FR/ZH/AR ve RTL/mobil kontrolleri mevcut A4 UI yaklaşımını izler.

## Clipboard, sürüm geçmişi ve bölümler

A4'ün mevcut tüketici eklentisi ortak fragman taşıyıcısına genişletilir. Tek bir plan hedef/alan/not kimliklerini ve gerekli not kayıtlarını birlikte tahsis eder. Fragman yalnız seçili sahiplerin gövdelerini içerir; hedef belgenin zarfını, bölüm havuzunu veya politikalarını üzerine yazamaz. HTML'de not payload'ı sürümlü ve schema ile doğrulanmış `data-edtr-note-fragment` taşıyıcısında bulunabilir; bu taşıyıcı güvenilir aynı oturum iddiası değildir. Tarayıcı tarafından kesilmiş/bozuk taşıyıcı ile gövdesiz işaret paste öncesinde açık hata üretir. `transformPasted` zarfı kaybetmeden payload okuma sırası test edilir.

- Normal aynı belge ve dış belge kopyası: yeni `nte_…`, yeni sahip, derin kopya gövde; kaynakla ortak değişken kayıt paylaşılmaz.
- Kes/yapıştır: A4'teki tek kullanımlı aktarım belirteci, aynı açık belge/oturum, fragman parmak izi, özgün sahibin yokluğu ve tüketilmemiş token birlikte doğrulanırsa kimlik korunur. Kesilmiş kayıt aktarım belleğinden geri alınır. İkinci paste kopyadır. Undo kesilmiş özgünü geri getirmişse paste kopya olur.
- Aynı belge drag-move: sahip+kayıt korunur; copy-drag yeni kimlik oluşturur. Move transaction'ın ara adımında sahibi görünmüyor diye kayıt erken çöpe atılmaz.
- Token yoksa veya başka editör/yeniden açılan aynı belgeyse normal kopya politikası geçerlidir. ID eşitliği tek başına hareket yetkisi vermez.
- Tam HTML kaydet/aç ve sürüm geri yükle havuzu/işaretleri birlikte korur. `documentLoad` bekleyen aktarımı, not panelini ve geçici yerleşim snapshot'ını temizler. Template/duplicate bütün not altgrafını yeni belgeyle birlikte klonlar.
- Bölüm ekleme/silme sahibin etkin numaralama kapsamını değiştirir. `keepBefore/keepAfter` ve sıradan bölüm sınırı silmesi not override'ları için de aynı açık korunma politikasını uygular; undo tam grafı döndürür.

## A5a — Sonnotların mevcut akışa entegrasyonu

Sonnotlar belge/bölüm sonunda normal satır/sütun/sayfa akışına katılır; ekranın altında ayrı bir flex panel veya çıktıda sonradan iliştirilen HTML kabul değildir. Kanonik içerik havuzdur. A4'ün düz TOC projeksiyonu gibi, görünüm mevcut desteklenen üst düzey `paragraph`, `bullet_list` ve `ordered_list` düğümlerinin türetilmiş kopyalarını kullanır. Yeni `note_group`/`note_entry` sarmalayıcı düğümü eklenmez. Liste kendi mevcut `list_item`/paragraf yapısını korur; yeni bir genel blok gezinmesi veya atomik not kutusu oluşturulmaz. Uzun paragraflar ve listeler mevcut satır/sütun/sayfa ölçümüne girer ve birden çok sayfaya akar.

Her projekte edilmiş ÜST DÜZEY blok şu attr'ları taşır; iç liste/paragraf çocuklarına bunlar kopyalanmaz:

```ts
type EndnoteProjectionAttrs = {
  noteOwnerId: string; // havuzdaki nte_…; yeni tanım veya sahip işareti değil
  noteBlock: number; // o notun gövdesindeki sıfır tabanlı blok sırası; kimlik değil
  noteScope: "documentEnd" | "sectionEnd";
  noteSectionId: string; // yerleştirildiği bölüm; kaynağın sıra indeksi değil
};
```

HTML taşıyıcıları `data-note-owner-id`, `data-note-block`, `data-note-scope`, `data-note-section-id` olur. `noteOwnerId` bulunan blok salt okunur türetilmiş içeriktir; not editörü havuzu değiştirir. Paragraf şemasına bu attr'lar eklenir. `addListNodes` ile gelen liste wrapper'ları bugün `rawAttrs`/`sectionEndId` taşımıyor: `bullet_list`/`ordered_list` spec'leri aynı attr/parseDOM/toDOM yardımcılarıyla genişletilir; `order` ve mevcut liste semantiği korunur. Bu ekleme iç içe bölüm sınırına izin vermez: yalnız üst düzey son projeksiyon bloğunda sınır olabilir, listedeki paragrafta veya alt listede olamaz. Liste normalizasyonu/paste/split bu kuralı da doğrular.

Görünen not numarası, not gövdesinin ilk paragrafına gerçek metin olarak öneklenir; gövde listeyle başlıyorsa ilk liste öğesinin ilk paragrafına eklenir. Desteklenen superscript mark'ı ve ardından ayırıcı boşluk kullanılır; yalnız CSS pseudo-element kullanılmaz. Sayı/boşluk kanonik body JSON'sine yazılmaz. Numaralar 9→10 olduğunda gövde kopyası havuzdan yeniden üretilir; önceki metinden önek tahminle kesilmez. Boş gövde tek paragraf olduğundan görünür bir numarası vardır.

Önemli bölüm bağlantısı: mevcut `documentSections` bir bölümü `sectionEndId` taşıyan bloğun SONUNDA bitirir. Sonnot bloğunu bu sınırdan sonra olduğu gibi eklemek notu sonraki bölüme taşır. Bu yüzden bölüm sonu projeksiyonu açıkça yönetilir:

1. `unprojectEndnotes(tr)` yalnız üst düzey marker'ları doğrulanmış türetilmiş blok dizilerini kaldırır. Dizinin son bloğundaki bölüm sonunu, o dizi öncesindeki son kanonik üst düzey bloğa geri taşır. Sınırı taşıyacak blok yoksa bir boş paragraf aynı transaction'da oluşturulur. Ham `sectPr` taşıyıcısı da `projectDocumentModel` ile yeniden üretilir. İşlem hedef bölüm veya terminal sınırı marker'ıyla uyuşmuyorsa tahminle kaydırmaz.
2. Kanonik bölüm aralıklarından sahip sırası ve sonnot dizileri hesaplanır. sectionEnd dizisi ilgili bölümün son kanonik bloğunun arkasına eklenir; o bloğun `sectionEndId` değeri dizinin SON üst düzey bloğuna taşınır. Son blok listeyse sınırı liste wrapper'ı taşır. documentEnd dizisi final bölümün sonunda eklenir; yeni bölüm oluşturulmaz ve `finalSectionId` korunur. Boş not kümesi türetilmiş blok yaratmaz.
3. Aynı projection helper son durumu üretir, sınır/registry eşleşmesini tekrar doğrular. Bir notun blokları bitişiktir; notlar sahip sırasındadır; `noteBlock` 0'dan başlayan eksiksiz sıradır. Bu sayılar havuz kimliği değildir. Kanonik body içinden gelen `sectionEndId`, not projeksiyonu marker'ı, A4 tanımı veya başka sahip işareti validator tarafından reddedilir.
4. Bölüm komutları ve sıradan sınır silme eklentisi kanonikleştir → mutasyon → tekrar projekte et sırasını tek kullanıcı işleminde uygular. Mevcut seçim/transaction pozisyonları aynı mapping üzerinden taşınır. Eski projeksiyon pozisyonu kullanılarak bölüm bölünmez veya yanlış ana metin silinmez.
5. Türetilmiş bloklara typing, split/join, backspace/delete, cut/paste ve drag ile doğrudan yazma engellenir. `contenteditable=false` tek başına yeterli sayılmaz; transaction koruması gereklidir. Ana metin ve sonnot cache'ini kapsayan select-all/range replace, kanonik içeriğe eşlenip havuz cleanup'ıyla uygulanır ve tekrar projekte edilir. Sadece projeksiyon metnini silmek not kaydını silmez; silme komutu sahip+kayıt üzerinde çalışır. Türetilmiş kopya clipboard'a ikinci not gövdesi/tanımı diye eklenmez.
6. Hedef/field/note koleksiyonları ve kimlik planlayıcısı marker'lı kökte aşağı inmeyerek kopyaları atlar. Not label/body değişimi A4 indeksine ikinci hedef eklemez. Native DOCX exporter'ı marker'lı blokları normal ana metin gövdesi olarak yazmaz; gerçek endnote parçasını kanonik havuzdan üretir.
7. Cache HTML'de taşınırsa yüklemede marker topolojisi ve sınır konumu doğrulanır; içerik havuzdan yeniden üretilir. Cache metni havuzun üzerine yazılmaz. Cache atılmadan önce sınır geri taşıma çalışır. Eksik/bozuk marker nedeniyle bölüm sonu güvenli geri kazanılamıyorsa yükleme kaynak değişmeden reddedilir.

Projection helper idempotansı, liste terminalinde sınır taşıma ve bölüm komutları kanıtlanmadan sonnot arayüzü tamamlandı sayılmaz. Projection transaction'ları ayrı undo adımı üretmez; kullanıcı işleminin geçmişi havuz ve bölüm grafını birlikte geri getirir. RTF/TXT destekli düzleştirme sonnotları görünür işaret+numara+gövde olarak açık sırayla bir kez üretir; hem cache hem havuz yazılarak çoğaltılmaz. A5a için gereken sayfalama değişiklikleri, mevcut akış yollarında `note_reference` atomunun ölçülen destekli inline nesne listesine eklenmesi ve marker'ların korunmasıyla sınırlı tutulur; yeni genel blok traversal motoru gerekmez.

## A5b — Gerçek dipnot rezervi ve devam sayfaları

Gövde JSON'sinden ölçülen not satırları mevcut font/paragraf/tab ölçüleriyle hesaplanır. Dipnot, nihai fiziksel sayfanın metin alanında, altbilgi ve alt marjın ÜSTÜNDE alan ayırır. `DocumentLayout.margins` değiştirilmez. Geçici not layer'ı mevcut `.pm-page` host'unun içinde bulunur; baskı/PDF aynı layer'ı sayfa snapshot'ından alır.

Sayfalama snapshot'ı aşağıdaki ek sözleşmeyi taşır. Koordinatlar zoom uygulanmamış CSS px; doc pozisyonu ile note-local pozisyon birbirine karıştırılmaz:

```ts
type NoteFragment = {
  noteId: string;
  from: number; to: number; // havuzdaki gövde PM doc'una yerel aralık
  pageIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  continuation: boolean;
};
type PageNoteReservation = {
  pageIndex: number;
  reservePx: number; // separator, gap ve fragmanların toplamı
  fragments: NoteFragment[];
};
// Ana yerleşim + rezervler aynı doc/revision snapshot'ında yayımlanır.
```

Yerleşim döngüsü:

1. Sahip işaretlerin dahil olduğu gövde satırlarını mevcut PM satır ölçümlerinden bul; sıralamayı `collectNoteIndex` belirler. Tam paragrafın başlangıç sayfası yerine işaretin gerçek satırı kullanılır. Tablo hücresindeki işaret de gerçek hücre satır/band konumuna bağlanır.
2. Önceki geçişin sayfa rezervleriyle gövdeyi akıt. Tek sütunda `computeLayout` içindeki sayfa başına `pageContentH`, satır split eşiği, uzun hücre kullanılabilir yüksekliği, tekrar başlık sığma hesabı ve son sayfa padding'i rezervi düşer. Sadece görsel spacer'a not eklemek yeterli değildir.
3. Sütun yolunda `solveColumnFlow` bir rezerv girdisi alır. `newPage` sonrası fiziksel alt sınır, `fit` capacity/fullCapacity ve continuous band balancing aynı rezervi kullanır. Tablo bandları/tekrar başlıklar küçülen alanda tekrar sınanır. Sadece `FlowFragment.rect` değerlerini sonradan yukarı taşımak kabul değildir.
4. Sahiplerin yeni sayfalarına not satırlarını ata, ayırıcı/gap dahil rezervi yeniden hesapla. Sahip satırı ve notun ilk okunabilir satırı aynı sayfada tutulur; sığmıyorsa sahip satırını önceki sayfada bırakmak yerine ana metin akışı ileri taşınır. Paragraf keep/widow ve tablo bölünme kuralları ihlal edilmez.
5. Uzun not satır/paragraf sınırlarında bölünür. Devam fragmanı aynı `noteId` ve yerel aralığı taşır. Önceki sayfadan gelen devamlar yeni başlayan notlardan önce, sahip sırasını koruyarak yerleşir. İlk sayfa separator ve devam sayfası continuationSeparator ayrı ölçülür. Notun ortası tekrarlanmaz, hiçbir aralık atlanmaz.
6. Devam için gerekirse gerçek yeni fiziksel sayfa oluşturulur; `pages` listesinde yer alır, geometri/altbilgi/sayfa numarası ve baskı/PDF kırpması bu sayfayı da içerir. Yalnız not içeren son sayfa yapay dış DOM yüksekliğiyle taklit edilmez.
7. Gövde dağılımı, sahip→sayfa eşlemesi, numara genişlikleri ve not fragman aralıkları birlikte kararlı olduğunda tek snapshot yayımlanır. Önceki tam snapshot yeni doc için geçerli gibi kullanılmaz.

İlk sütun politikası: fiziksel sayfa genişliğinde TEK dipnot bandı; sütunlara bölünmüş ayrı not havuzları yok. Bandın yatay alanı fiziksel sayfanın geçerli metin marjlarıdır. Aynı sayfadaki farklı continuous bölüm alt marjları için güvenli ortak alt sınır en kısıtlayıcı sınırdır; rezerv bütün ilgili sütun/bandlardan düşer. 1→2→3 sütun, RTL akış ve continuous geçişte bu politika Word fixture karşılaştırmasıyla doğrulanır. Native sütun başına dipnot, beneathText veya eşlenemeyen özel ayırıcı ilk pakette desteklenmiş gibi dönüştürülmez; açık ret/koruma tanısı gerekir.

Tek bir not satırı kullanılabilir fiziksel alandan uzunsa `note-unit-exceeds-page`; boş sayfada sahip satırı+ilk not satırı yerleşemiyorsa `note-anchor-cannot-fit`; değişen snapshot `note-layout-stale`; döngü `note-layout-nonconvergent` üretir. UI ve bütün çıktılar bu tanıyı gösterir; kırpılmış/kayıp içerikle başarı verilmez. Bir piksel toleransı belgelenir, fakat ölçülen taşmayı görünmez yapmak için keyfi max-height kullanılmaz.

## Ortak yerleşim ve çıktı kapısı

Ana entegrasyon sahibi `lib/document-output-layout.ts` içinde tek `flushDocumentOutputLayout(view)` kapısı kurar. A4 `flushReferenceLayout` çağrı noktaları bu kapıya taşınır veya geriye uyumlu dış wrapper olur; aynı view için paylaşılan promise/revision kullanılır. İç tek-geçiş helper'ları dış kapıyı tekrar çağırmaz. Mevcut `flushDocumentLayout` fiziksel pass ve `flushColumnFlow` işlevleri yeniden kullanılır; iki koordinatörün birbirini recursive beklediği yapı kurulmaz.

Her dış geçiş: sonnot projeksiyonu + not numaraları + metin/SEQ/TOC → font/tab ölçümleri → gövde+dipnot rezervi → fiziksel sayfa alanları/PAGEREF/TOC → tekrar ölçüm. Composition, belge revision'ı, detach ve font hazır olma koşulları mevcut A4/A3 kurallarını korur. Dış döngü en çok 16 geçiş; sütun iç koordinatörü mevcut 8 geçiş sınırını korur. Tekrarlanan farklı signature döngü olarak erken başarısız olur; sınıra ulaşmak başarı değildir. Signature, ana sayfalar/regions/fragments yanında not rezervleri ve note-local aralıklarını içerir.

`Editor.tsx` export/print, `preparePrintLayout`, PDF ve `docToDocxBlob` bütün girişleri aynı kapıyı bekler. DOCX'in bugün “field/TOC yoksa hızlı dön” koşulu notları da kapsayacak şekilde değişir. Salt okunur renderer not gövde fontlarını da yükler; yalnız ana `doc.descendants` yeterli değildir. Hata halinde eski sayfa sonucu indirilmez. Mutasyon yapan derived transaction'lar ayrı undo adımı oluşturmaz ve export sırasında kullanıcı değişikliğiyle karıştırılmaz.

PDF görüntüsü mevcut ölçülmüş sayfalardan gelir. İşaret→not başlangıcı ve not→sahip geri bağlantıları fiziksel sayfa/koordinat snapshot'ından gerçek GoTo hedefleri alır; continuation kopyaları yeni hedef tanımı değildir. `lib/pdf-snapshot.ts` görünmez Unicode metin katmanının sırası da güncellenir: fiziksel sayfa başına ana metin okuma sırası, ardından o sayfada görünen dipnot fragmanları not sırasıyla yazılır; devam fragmanı yalnız kendi aralığını içerir. Görünmez ölçüm kaynakları ve kırpılmış başka sayfa kopyaları extraction'a girmez. DOM/HTML mantıksal sırası, PDF extraction sırası ve native DOCX not ilişkisi ayrı marker fixture'larıyla sınanır. Tagged PDF/ekran okuyucu semantiği bununla otomatik sağlanmış sayılmaz; varsa ek erişilebilirlik sınırı kabul raporuna yazılır.

## Native DOCX içe/dışa aktarma

Terra'nın `lib/note-docx.ts` adapter'ı native notları Mammoth'un düz link/listesine dönüşmeden önce tespit eder. `prepareNoteImport` bütün desteklenmeyen not özelliklerini erken tarar; kaynak zip'i değiştirmeden açık hata verebilir. Uygulama kimliği haritasının anahtarı en az `(importSession, resolvedPartUri, kind, nativeId)` olur. Parça adı sabit `word/footnotes.xml` varsayılmaz; paket relationship'i çözülür. Separator/continuationSeparator kullanıcı havuzuna girmez; varsayılan ayırıcılar desteklenen kanonik separator/continuationSeparator çizgisine eşlenir. Özel ayırıcı biçimi ilk pakette açık destek dışı tanılanır; saklanmayan kaynak biçimi korunmuş sayılmaz.

Import adapter'ı source not gövdelerini biçim restore zincirinden geçirip doğrulanmış PM JSON'ye dönüştürür, ana metin işaretlerini token ile korur, Mammoth'un ürettiği sonnot/geri-link kopyalarını bir kez kaldırır. Tokenlar session bazlı benzersizdir; görünür metin arama veya paragraf sırası eşlemesi yapılmaz. `doc-import.ts` zincirindeki kesin insertion/restore sırası text-box/reference/formatting adapter'larıyla çakışma testinden sonra sabitlenir. `fileToHtml` dönüşü, `parseDocumentHtml`ye v5 not havuzunu taşıyan doğrulanmış geçici import metadata'sı verir; yeni model zarfı üretimi yalnız migration kapısında yapılır.

Export ana metne native `w:footnoteReference` / `w:endnoteReference`, gövde parçalarına gerçek not kayıtları ve uygun native gövde işareti yazar. Parça relationship'leri, `[Content_Types].xml`, `settings.xml`/bölüm `footnotePr` ve `endnotePr`, format/start/restart/placement ayarları güncellenir. Eski source part veya relationship'in iki kez eklenmemesi `restoreDocxPackage` ile açık sahiplik sözleşmesi ister: desteklenen note graph'ın sahibi note adapter'ıdır; preservation adapter'ı onu eski haliyle geri getiremez. Dış bağlantılar ve desteklenen not stil ayarları doğru parça relationship kapsamıyla yeniden yazılır. Geçici export token/bookmarkları nihai pakette kalmaz.

Native tamsayılar export başına türetilir, `nte_…` yerine geçmez. İlk native paket testleri Word'ün özel kimlik metadata'sını koruduğunu kanıtlamaz. Uygulama→uygulama tam HTML kimlik koruması zorunludur. DOCX tekrar açışında özel eşleme yoksa yeni `nte_…` tahsisi raporlanabilir; içerik/sahip bağlantısı/numaralama eşdeğerliği ayrı kabul sonucudur. Word edit→download sonrasında birebir kimlik koruması ancak gerçek probla kanıtlanır.

Destek dışı native örnekler: yinelenen sahip, eksik note part/body, bilinmeyen not türü, custom mark, eachPage restart, desteklenmeyen body node/field, tracked değişiklikte belirsiz sahip veya çözülemeyen relationship. Bunlar başarıyla düz metne çevrilmiş sayılmaz. Kullanıcı dosyası bozulmadan kalır; destek matrisi kısıtı ve tanı fixture'ı birlikte eklenir.

## İş paylaşımı ve sıralama

Ortak dosyalarda eşzamanlı yazma yapılmaz. Ana ajan A4'ü yayınlar, sonra A5 branch'ini açar ve entegrasyon dosyalarını tek sahip olarak yönetir. Sol/Terra kendi saf yardımcı/adapter dosyalarında çalışır; aşağıdaki sözleşme değişikliği gerekiyorsa önce ortak tipe tek revizyon yapılır.

| Paket | Sol sahibi | Terra sahibi | Ana ajan sahibi / teslim kapısı |
| --- | --- | --- | --- |
| A5.0 sözleşme | `lib/document-notes.ts`: tipler, validasyon, indeks/numaralama; `scripts/check-document-notes.cjs` | Native fixture matrisi ve `note-docx.ts` ön tarama; source part kapsamı | v5 migration/schema ve ortak interface'ler; eski v4 regresyonu |
| A5.1 atomik düzenleme | Komutlar, owner+registry cleanup, body transaction köprüsü, clipboard plan helper'ı | Import/export not graph codec ve package fixture'ları | `Editor.tsx`, note panel/menu/i18n ve mevcut reference clipboard tüketicisine entegrasyon |
| A5.2 sonnot | `unprojectEndnotes`/`projectEndnotes`, bölüm komutları için saf projection helper'ları | Düz paragraf/liste projeksiyonunun mevcut ölçüm yollarında akışı; native endnote gerçek Word probu | Bölüm eklentisi/komut entegrasyonu, history ve A5a UI/print/PDF kabulü |
| A5.3 dipnot | Note-local body ölçüm girdisi/numara cache'i; stale panel ve undo testleri | `lib/note-layout.ts`: reservation/continuation solver; single-column/column adapter değişiklikleri; `scripts/check-note-pagination.cjs` | Ortak output barrier ve layer/snapshot entegrasyonu; A4 field/TOC regresyonu |
| A5.4 kabul | Clipboard/restore/convert/undo e2e | Native paket + Word/PDF karşılaştırması, uzun devam ve sütun fixture'ları | Son build, gerçek UI, açık sınırlar raporu, commit/yayın/canlı kabul |

İlk bağımsız görevler: Sol, v5 not tipleri + doğrulayıcı + belirlenimci numaralama/komut yardımcılarını UI olmadan teslim eder. Terra, mevcut `notes.docx` için semantik import/export ön tarama ve eşit native ID/ayırıcı/eksik gövde fixture'larını hazırlar; ardından gövde rezervinin her iki pagination yoluna nasıl geçtiğini küçük ölçüm fixture'ıyla kanıtlar. Ana ajan v5 ve schema entegrasyonunu bu iki teslimden sonra yapar. A5a çıkış kapısı kapanmadan dipnot UI hazır gibi sunulmaz.

## Kabul ve kanıt defteri

Yeni `docs/notes-acceptance.md` her ölçümü commit/fixture/komut, beklenen sonuç, gerçek sonuç ve sınırlamayla kaydeder. Sentetik markerlar içerik sayımı içindir, kimlik değildir. En az:

1. Model: v0–v4 migration/idempotans; v5 save/open/version restore; gelecek/bozuk zarf; orphan/duplicate/missing owner; tür ve farklı not parçalarında aynı native ID; kaynak değişmezliği.
2. Düzenleme: ekle/yaz/sil/convert; çok not; body list/tab/RTL; ana+not odağında undo/redo; composition; boş not; not açıkken owner silme, belge değiştirme/restore ve salt okunur koruması.
3. Clipboard: aynı/dış belge copy, tokenlı cut, ikinci paste, cut undo sonrası paste, reload token iptali, drop-move/copy, bozuk/missing payload, destination ID collision; her durumda kayıt+sahip sayımı.
4. Sonnot: documentEnd ve sectionEnd; bölüm split/remove `keepBefore/keepAfter`; kaynak son paragrafı silme; düz sonnot paragraf/liste dizisinin iki sayfaya ve 1/2/3 sütuna akması; ilk/son blok listeyken numara ve terminal sınır; cross-cache range replace/selection mapping; projection idempotansı; native export'ta gövdenin ana metinde yinelenmemesi.
5. Dipnot: tek sayfada çok not; sayfa altındaki owner'ın ileri taşınması; iki/üç sayfa devam; note-only son sayfa; section numbering restart ve dönüşüm; tablo hücresi owner; continuous mixed geometry/columns/RTL; footer alanıyla çakışmama; her note-local aralığın tam bir kez görünmesi.
6. Yakınsama: 9→10 ve 99→100 not numarası genişliği, TOC/PAGEREF ile sayfa değişimi, font yüklemesi, zoom, composition, stale revision, oscillation/limit ve detach; hata görünür, çıktı üretilmez.
7. Native: relationship/part/content-type bütünlüğü; separator kayıtları; format/restart/placement; app→DOCX→app ve gerçek Word edit→download→app; içerik/bağlantı eşdeğerliği ile birebir kimlik korunması ayrı rapor.
8. Çıktı: açık belge ve sidebar/salt okunur belge aynı fiziksel sayfa/not fragmanları; PDF GoTo ileri/geri; print kırpılmama; HTML save/open ve TXT/RTF'de bir kez görünür düzleştirme. PDF extraction'da sayfa başına gövde→not ve uzun devam sırası marker fixture'ıyla zorunlu doğrulanır; tagged PDF erişilebilirliği ayrı raporlanır.

Odaklı yeni script'ler ve etkilenen mevcut `check-document-identity`, reference UI/DOCX/pagination, section, column/tab regresyonları çalıştırılır. `pnpm build` ve seçili gerçek UI kontrolleri geçtikten sonra yayın yapılır; canlıda sonnot, dipnot+devam, DOCX indirme ve PDF sayfa bandı kontrol edilir. A5 tamamlandı ifadesi yalnız bu kapılar ve belgelenmiş destek sınırlarıyla kullanılabilir.
