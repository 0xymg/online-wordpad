# Belge kimliği, geçiş ve referans sözleşmeleri

Durum: A0 sözleşmesi kök ajan incelemesinden geçti; A1 `2f6e8bd` ile canlıda doğrulandı. A2 sekme modeli yerel doğrulamadadır; güncel yazıcı model sürümü 2'dir. Bu dosyanın başlangıç denetimi A0 öncesi durumu kaydeder; sonraki sözleşmeler uygulanan modeli ve ilerideki paketlerin sınırlarını ayırır. Ürün kapsamı ve sıra için `advanced-document-plan.md`, A2'nin ölçülmüş destek sınırı için `tab-stops-support.md` esas alınır.

## A0 başlangıç denetimi — tarihsel durum

| Alan | Bugünkü veri | Sonuç |
| --- | --- | --- |
| Bölümler | `lib/document-sections.ts`, üst düzey düğümlerin ham `docxProperties` içindeki `sectPr` sınırlarından `{from,to,geometry}` üretir. Son bölüm `layout.section` içindedir. | Sıra ve ProseMirror pozisyonu değişebilir; kalıcı bölüm kimliği yoktur. |
| Bölüm ayarları | `layout.sectionMargins[index]`; `layout.running['index:variant:kind']`; `runningKey(section:number,…)`. | Ortaya bölüm eklemek/silmek, alanları yeniden eşlemeden yapılırsa yanlış üstbilgi veya marjin seçilebilir. |
| Hedefler ve alanlar | Başlıkta hedef kimliği yoktur. `doc_field`, PAGE/NUMPAGES veya OTHER talimatı/önbelleği taşır; alan kimliği ve yapısal hedef bağlantısı yoktur. | Görünen metin, başlık sırası veya önbellek sonucu hedef kimliği olarak kullanılamaz. |
| İçindekiler | `Editor.tsx::insertTOC`, başlık metinlerinin kopyasından sıradan paragraflar ekler. | Bugünkü TOC canlı alan veya bağlantılı referans değildir. A4 bunu açıkça ayrı bir nesne olarak tanımlamalıdır. |
| Notlar | `docx-formatting.ts`, dipnot/sonnot parçalarını biçimlendirme dönüşümüne dahil eder. Şemada not gövdesi/işareti ve ortak kalıcı kimlik modeli yoktur. | DOCX parçasının okunması, düzenlenebilir veya kayıpsız not desteği kanıtı değildir. |
| Taşıma kimlikleri | `EDTRimport…` biçim sınıfları/yer imleri, `EDTRLayout…` export yer imleri, metin kutusu geçici yer imleri ve OOXML ilişki kimlikleri. | Bunlar belirli dönüşümün kimlikleridir; kullanıcı hedefi, not veya bölüm kimliği değildir. |
| Görsel/metin kutusu | Yerleşim ve katman attr'ları kalıcıdır; ayrı nesne kimliği yoktur. | Pozisyon, `src`, alt metin ve nesne sırası nesne kimliği yerine geçmez. |
| Depolama | `serializeDoc`, şema HTML'sini ve `data-edtr-layout` JSON'unu saklar. Misafir dosyaları localStorage; üye dosyaları `document.html` alanındadır. | Kaydedilen HTML'nin bağımsız model sürümü yoktur. SQL satır kimliği içerik içindeki hedef kimliği değildir. |
| Sürümler | Misafir: `lib/versions.ts` içinde en çok 5 HTML anlık görüntüsü; 200.000 karakterden büyük yeni görüntüler atlanır. Üye: `document_version` içinde en çok 10 HTML anlık görüntüsü. | Kimlik ve model sürümü HTML ile birlikte taşınmalıdır; ayrıca bir sunucu tablosuna bağlı olmamalıdır. |
| Geri yükleme | `restoreVersion`, mevcut içeriği yedekler; `setDocFromHtml` üzerinden HTML'yi açar ve aynı dosyaya kaydeder. Yükleme `addToHistory:false` kullanır. | Geçiş aynı yükleme girişinden çalışmalı; sürüm geri yükleme kimlikleri yeniden üretmemelidir. Belge değişimi ile undo yalıtımı ayrıca test edilmelidir. |
| Yapıştırma | Özel `handlePaste` yalnız resim dosyalarını yakalar; kalan HTML ProseMirror'ın normal ayrıştırıcısından geçer. | Gelecekte kimlik attr'ları eklenince varsayılan yapıştırma tek başına çakışma güvenliği sağlamaz. |

Denetim yerel kaynak koduna dayanır; Word Online ile görsel eşleşme veya henüz uygulanmamış düzenlenebilirlik iddiası değildir.

## Kimlik kuralları

1. Kimlik görünür addan, metinden, sıralamadan, sayfadan veya ProseMirror pozisyonundan türetilmez. Düzenleme ve aynı belge içindeki gerçek taşıma kimliği korur. Silme kimliği başka nesneye tahsis etmez; undo aynı kimliği geri getirir.
2. Biçim `<tür>_<32 küçük harfli onaltılık karakter>`dir. Türler: `doc`, `sec`, `tgt`, `nte`, `src`, `fld`, `obj`. Uygulama yeni kimlik için `crypto.randomUUID()` benzeri UUID üretimini sağlar; saat veya `Math.random()` yedeği kullanılmaz. Kimlikler sır değil, çakışmadan bağımsız nesne tanımlayıcılarıdır.
3. Kimliklerin yetki alanı açılmış belgenin içerik grafıdır. Dosya/SQL satırı kimliği, modeldeki `doc_…` kimliğinden ayrıdır. Farklı dosyalar birleştirilirken aynı kimlik varsayılan olarak aynı nesne kabul edilmez.
4. Kimlik tanımı ile kimliğe başvuru ayrıdır. Örneğin bölüm kayıt havuzu bir `sec_…` tanımlar; bölüm sınırı aynı kimliğe başvurur. Not havuzu bir `nte_…` tanımlar; işaret o notu gösterir. Yardımcıya aynı tanım hem havuz hem işaret olarak iki kez verilmez.
5. Her tanım kendi türünde geçerli ve belge içinde tektir. Aynı eski kimlik birden fazla tanıma atanmışsa başvurunun hangi hedefe ait olduğu tahmin edilmez. Nesneler benzersizleştirilir; belirsiz bağlantı açık hata durumunda kalır. Metin eşleşmesiyle onarılmaz.
6. Sayfa numarası, başlık numarası, dipnot etiketi ve kaynakça sıra numarası türetilen gösterimdir. Bir kimliğin numarası değişebilir; kimliği değişmez.

`lib/document-identity.ts` bu sınırlı çekirdeği uygular: doğrulama, çakışmaya karşı ayırma, koru/klonla planı ve açık başvuru sonucu. Hiçbir belgeyi taramaz, değiştirmez veya kaydetmez. Entropi üreteci zorunlu bağımlılıktır; aynı girdiler ve aynı üreteç çıktıları aynı planı verir. Plan, bütün mevcut geçerli kimlikleri yeni tahsislerden önce ayırır. Üretecin tekrar tekrar çakışması açık hata üretir.

## Sürümlü taşıma ve geçiş

Kanonik ek veri `doc.attrs.documentModel` içindedir. HTML üst sarmalayıcısı bunu `data-edtr-model` JSON'u ile taşır; `data-edtr-layout` geometrisi ve ham OOXML koruması ayrı kalır. `documentModel.version` pozitif tamsayıdır; bulunmaması eski sürüm 0 anlamına gelir. A1 sürüm 1'i yazdı; A2 sürüm 1'i okuyup kimlikleri koruyarak sürüm 2'ye geçirir. Yeni kayıtlar sürüm 2'dir; 2'den büyük veya bilinmeyen bir sürüm ayrıştırma/otomatik kaydetme başlamadan reddedilir.

Güncel şekil ve geriye dönük okuma tipi:

```ts
type DocumentModel = {
  version: 2;
  id: DocumentIdentity<"document">;
  finalSectionId: DocumentIdentity<"section">;
  sections: Record<string, SectionRecordV1>;
};
type DocumentModelV1 = Omit<DocumentModel, "version"> & { version: 1 };

type SectionRecordV1 = {
  // Record anahtarı sec_… kimliğidir; bu alanlarda ayrıca indeks tutulmaz.
  page: { width: number; height: number; margins: Margins }; // twip
  start: "nextPage" | "continuous" | "oddPage" | "evenPage";
  numbering: { start?: number; format?: string };
  running: Record<string, RunningSlotV1>; // default:header, first:footer vb.
  rawProperties?: string; // tanınmayan sectPr özelliklerinin koruma kaynağı
};
```

Gerçek tipler ve doğrulama `document-model.ts` içindedir; bu belge ikinci bir çalışma zamanı şeması değildir. Not/kaynak/alan havuzları ilgili paketler gelince sürümlü göçle eklenir. Bilinen bölüm ayarını kimlikli kayıt yönetir; export bilinmeyen ham özelliklerle birleştirir. `layout.sectionMargins` ve `layout.running` eski diyaloglar için mevcut kimlik sırasından üretilen uyumluluk görünümleridir. Eski bir diyalog bunları değiştirdiğinde eklenti değişikliği aynı kimlik sırasıyla kayda alır; bölüm ekleme/silme eski indeksleri başka bölüme taşımaz.

Sürüm 2 artışı yalnız JSON şekli için değildir. A2'nin gerçek `tab` atomu ve paragraf/stil sekme attr'ları sürüm 1 ayrıştırıcısında bilinmez; eski okuyucunun bunları sessizce düşürüp belgeyi yeniden kaydetmesi engellenmelidir. A1 okuyucusu 2'yi desteklenmeyen sürüm olarak reddeder. 1 → 2 geçişi `doc_…`, bütün `sec_…`, sınırlar, kayıtlar ve üst/altbilgi bağlantılarını korur; yeni kimlik tahsisi yapmaz. Sürüm 0 ise mevcut sınırlarını bir kez kimliklendirir.

Geçiş sırası ve atomiklik:

1. Orijinal HTML ve meta veri korunur; kaynak depolamaya önce boş/yarım belge yazılmaz. Üst zarfın sürümü şema ayrıştırmasından **önce** okunur. Bilinmeyen yeni sürüm normal eski ayrıştırıcıya verilerek sessizce düşürülmez; orijinal korunur, düzenleme/otomatik kaydetme açılmaz ve desteklenmeyen sürüm durumu gösterilir.
2. Sürüm 0 HTML mevcut şemayla ayrıştırılır. Ham bölüm sınırları belge sırasıyla bir kez numaralanır; son bölüm ayrıca alınır. Her bölüme bir `sec_…`, belgeye bir `doc_…` tahsis edilir.
3. Aynı özgün sıradan `index → sectionId` eşlemesi üretilir. `sectionMargins` ve `running` yuvaları bu eşleme ile yeni kayıtlara taşınır. İndeks, sonradan kimlik gibi kullanılmaz. Kayıp/aralık dışı indeksli veri sessizce başka bölüme atanmaz; geçiş tanısında korunur ve kaydedilebilir geçiş tamamlanmadan çözülür.
4. Yerel düzenlemeler, özgün `sectPr`, başlangıç türü, numaralama ve üst/altbilgi ilişkileri birleştirilir. Eski `linked:true`, aynı varyant/tür için önceki bölümden dinamik miras alma anlamını korur. Geçiş, mirası görünür HTML'yi kopyalayarak bağımsızlaştırmaz.
5. Sonuç yeni şema ve çapraz kayıt kurallarıyla doğrulanır. Tam belge ve model tek yükleme işlemiyle yerleştirilir; migration işlemi undo'ya eklenmez. İlk kullanıcı düzenlemesi tek başına geri alınabilir. Bölüm veya not kayıtları ayrı bir asenkron kayıtla yazılmaz.
6. Başarılı geçiş doğrulanmış kanonik HTML olarak kaydedilir; kullanıcı yazmasa da sonraki açılış aynı kimlikleri kullanır. Sürüm 1, kimlikleri değişmeden 2 olur. Desteklenen bir sürüm bozuksa tanı üretilir; bağlantı tahminle düzeltilmez. Geçiş başarısızsa kaynak HTML korunur ve düzenleme/otomatik kayıt açılmaz.

`parseDocumentHtml` aktif yükleme, başlangıç yüklemesi, üye dosya getirme, sürüm geri yükleme ve tam belge içe aktarma yollarının ortak geçiş girişidir. Üst/altbilgi alt belgeleri ana belgenin modelini yanlışlıkla yeni belge olarak göç ettirmemelidir. Belge yüklemede geçmiş eklentisi sıfırlanır; sayfalama eklentisi korunur. Başarısız yükleme, önceki editör içeriğini reddedilen dosyanın yerine kaydetmez.

Sürüm geçmişi tam içerik grafını saklar. Geri yükleme, kaydın kimliklerini ve iç başvurularını birlikte geri getirir; eski 0/1 kayıtları güncel sürüme geçer. Bir önceki yedeğin HTML'si yerinde değiştirilmez. Desteklenmeyen bir belge açıkken kullanıcı yeni belgeyle açıkça değiştirmeyi seçerse güvenlik yedeği boş editörden değil, özgün HTML'den alınır. Misafir kota/karakter sınırı nedeniyle yedek alınamıyorsa bu tam güvence olarak raporlanmaz.

## A2 sekme verisi ve düzenleme sözleşmesi

- Gerçek sekme, şemada `tab` adlı bir satır içi atom ve metin dışa aktarımında tek U+0009 karakteridir. `parseDocumentHtml`, metin içindeki sekmeleri modele geçirirken kod bloklarındaki literal sekmeleri metin olarak bırakır. HTML, `span[data-edtr-tab="true"]` ile atomu taşır. Tablo hücresi gezinmesi ile gerçek sekme ekleme ayrı klavye işlemleridir.
- `ParagraphFormat.tabs`, `{position, alignment, leader}` dizisidir. Konum tamsayı twip; hizalar `left/center/right/decimal/clear`, liderler `none/dot/dash`tır. Uygulama `dash` değerini native OOXML `hyphen` liderine çevirir. Aynı konumda sonraki katman kazanır; konuma göre sıralama kanoniktir.
- Stil taban zinciri, özgün native paragraf ayarı ve doğrudan düzenleme konuma göre birleştirilir. `clear` tombstone silinmez: aynı konumdaki devralınan durağı bastırır. Stil değişince diğer konumlar güncellenir; doğrudan elle verilmiş duraklar korunur. Karışık seçim tek paragrafın değerlerini ortak değer diye göstermez.
- “Durağı kaldır” hedef konuma `clear` yazar. “Özel durakları temizle” desteklenen mevcut konumları temizler. “Sekme düzenlemelerini sıfırla” yönetilen doğrudan değişiklikleri kaldırır; devralınan veya özgün içe aktarılmış native ayarlar yeniden görünür. Bilinmeyen native türler/liderler bu düğmeyle sessizce kaldırılmaz.
- Bilinmeyen native durakların XML'i paragrafın `docxProperties` kaynağında; stilin özgün `pPr` XML'i `rawParagraphProperties` içinde korunur. Desteklenmeyen bir native durak aynı konumdaki devralınmış durağı gölgeler; yanlışlıkla desteklenen başka bir hizaya çevrilmez. Açıkça düzenlenen aynı konum değiştirilebilir, dokunulmayan konumlar korunur. Koruma, editörde render veya Word ile görsel eşleşme demek değildir.
- `layout.defaultTabStop` pozitif tamsayı twip; varsayılanı 720'dir. `layout.decimalSeparator`, EDTRDocs için `.` / `,` / `٫` seçeneklerinden biridir; varsayılanı `.`dır. Bu iki ayar belgeyle, HTML ve sürüm geçmişiyle birlikte kalır. Diyalogdaki belge ayarları ile stil taslağındaki duraklar ayrı kapsamdır. Kaydedilmemiş stil taslağı, üst diyalog Kaydet demeden belgeyi değiştirmez.
- Diyalog, cetvel ve stil düzenlemesi aynı işlem yardımcısını kullanır; birden çok paragraf ve belge ayarı tek undo işlemidir. Cetvel sürükleme önizlemesi kalıcı veri değildir. Yeniden ölçüm, zoom veya bidi segment sarmalayıcıları belgeye kaydedilmez.

Word'deki ondalık sekme davranışı ile EDTRDocs'un belge içi ayıracı ayrı kavramlardır. Microsoft, ondalık sekme ayıracını değiştirmek için bölgesel sayı ayarlarını açıklar; bu kaynak Word Online'ın tüm bölge kombinasyonlarını doğrulamaz. `w:decimalSymbol` alan değerlendirme ayarının sekmeleri yönettiği varsayılmaz. [Microsoft'un ondalık sekme açıklaması](https://support.microsoft.com/en-gb/word/use-decimal-tabs-to-line-up-numbers-with-decimal-points).

EDTRDocs ondalık ayıracı DOCX'te standart özel özellik taşıyıcısındaki uygulamaya ait `EDTRDocs.TabDecimalSeparator` adıyla saklanır. Gerçek Word Online düzenle → indir probunda virgül değeri, ilişkisiz özel özellik ve paket ilişkisi korundu. Uygulamanın tekrar açma/yeniden aktarma testi virgül ve `٫` değerini, yabancı özelliği ve benzersiz property kimliklerini doğruladı (`check-tab-decimal-metadata.cjs`). Bu EDTR tercihinin taşınmasıdır; Word'ün bölgesel sekme davranışını değiştirmez. Native `w:defaultTabStop` desteği bundan bağımsızdır.

## A1 bölüm sözleşmesi

- Bir bölüm, kimlikli bir kayıt ile yapısal bir son sınırdan oluşur. Son bölümün sınırı belgenin sonudur ve `finalSectionId` ile belirlenir. Önceki bölümlerin son sınırları `sec_…` başvurusu taşır; sınırın o paragrafın öncesine değil, bitirdiği içeriğe ait olduğu nettir. A1 uygulaması mevcut `sectPr` paragraf bağlantısını kimlikli `sectionEndId` attr'ına taşır; ayrı bölüm-sonu düğümü ancak seçimin/split davranışının kanıtı gerektirirse tasarım incelemesinde seçilir.
- `documentSections` sonucu `{id, from, to, geometry}` üretir. Sıra ve aralıklar belge ağacından türetilir. Kalıcı `sectionIndex` ikinci doğruluk kaynağı olmaz. Paneldeki “Bölüm 2” yalnız görünen sıradır.
- “Öncekine bağla”, aynı varyant/tür için belge sırasındaki önceki bölümden dinamik mirastır. Bağımsız bölüm kopyası oluşturmak ayrı işlemdir. Eski bir bölümü silmek, kalan bağımsız başlıkları yanlış indeksle kaydırmaz.
- Bölüm sonunu silme komutu açık bir politika alır: `keepBefore` veya `keepAfter`. Önceki içerik ya da sonraki içerik ayarları korunur; işlem bunu kullanıcıya açıklar. Kaldırılan kaydın ham özellikleri ve bağlantıları aynı undo kaydında geri dönebilir olmalıdır.
- Bölüm içine ekleme, sınırda ekleme ve son bölümden sonra ekleme ayrı test edilir. Nesnenin sayfası mevcut paragraf bağlantısından türemeye devam eder; bölüm kimliği görüntünün mutlak sayfa numarası değildir.
- Modelde başlangıç türünün bulunması, her türün UI/pagination desteğinin hazır olduğu anlamına gelmez. İlk A1 arayüzü planın sonraki sayfa/sürekli kapsamını izler; tek/çift sayfanın korunması, oluşturulması ve görünümü ayrı raporlanır.

## A4–A6 referans ve not sözleşmesi

| Nesne | Kalıcı kimlik / kanonik içerik | Değişiklik ve silinme davranışı |
| --- | --- | --- |
| Başlık, yer imi, şekil/tablo açıklaması | Hedef düğümde `targetId: tgt_…`; görünen metin ve numara ayrı. | Yeniden adlandırma/taşıma kimliği korur. Silinen hedefe başvuru `missing-target` olur; aynı adlı başka başlığa yönlenmez. |
| Alan/çapraz referans/TOC nesnesi | Her alanın `fieldId: fld_…` kimliği; talimat, hedef kimliği, gösterim türü ve önbellek ayrı. TOC girişleri hedef listesinden türetilir. | Önbellek sonuç kimliği değildir. Düzeltilebilir `missing/ambiguous/unsupported` durumu vardır. Güncelleme metin aramasıyla değil hedef bağıyla yapılır. |
| Not | Havuzda `noteId: nte_…`, tür (`footnote/endnote`) ve şema içeriği; ana metinde kimlikli işaret. | İlk pakette her notun tek sahip işareti vardır. İşaret/gövde birlikte eklenir/silinir/klonlanır/geri alınır; numara sırasına göre yeni not bulunmaz. |
| Kaynak | Havuzda `sourceId: src_…`; yapısal kaynak alanları. Atıf alanı kaynağa başvurur. | Başlık/DOI düzenlemek kimliği değiştirmez. Aynı DOI/başlık benzerliği otomatik birleştirme yetkisi değildir. Kaynak silme, kullanan atıfları açıkça ele alır. |
| Yüzen nesne | Görsel/metin kutusunda `objectId: obj_…`; ilgili açıklama ayrı hedef olabilir. | Taşıma/katman/boyut kimliği korur. Çoğaltma yeni kimlik üretir. |

Başvuru içeriği, not gövdesi ve kaynak havuzu düz HTML'ye veya geçici sayfalama dekorasyonuna saklanmaz. Havuzdaki şema içeriği aynı parser ve güvenli attr doğrulamasından geçer; keyfi çalıştırılabilir HTML kabul edilmez. Registry güncellemesi ve işaret değişikliği aynı ProseMirror transaction'ında olmalıdır.

Numara ve sayfa sonuçları düzenlemeden sonra kontrollü yeniden hesaplanır. Baskı/DOCX/PDF öncesi bekleyen alan güncellemeleri tamamlanır. Alan metninin genişliği sayfalamayı değiştirirse sınırlı yeniden ölçümle sabit noktaya ulaşılır; döngü sınırına ulaşmak başarı sayılmaz. Üretilmiş sayfa dekorasyonları, not devam kopyaları ve TOC ölçüm kopyaları yeni kimlik tanımları değildir.

## Kopyalama, yapıştırma ve taşıma matrisi

| İşlem | Kimlik davranışı | Başvurular |
| --- | --- | --- |
| Yazı ekleme/silme, başlığı yeniden adlandırma, atomik aynı belge taşıması | Korunur. | Değişmez; pozisyon transaction mapping ile yenilenir. |
| Aynı belgeye normal kopyala/yapıştır | Yapıştırılan tanımlar, alanlar, not gövdeleri ve nesneler yeni kimlik alır. | Kopyalanan hedefe giden iç bağlantılar yeni hedefe çevrilir. Kopya dışındaki mevcut hedefe ancak aynı açık belge bağlamı doğrulanmış ve hedef hâlâ varsa bağlanır. |
| Başka belgeye kopyala/yapıştır | Gelen tanımlar yeni kimlik alır. Gerekli not/kaynak kayıtları fragmanla taşınır. | Fragman içi bağlantılar yeniden eşlenir. Dış hedefe bağlanılmaz; açık eksik hedef sonucu korunur. Aynı adlı/aynı kimlikli hedefe tahmini bağ kurulmaz. |
| Aynı belge içinde kes/yapıştır | Kimliği koruyan taşıma yalnız tek kullanımlı uygulama aktarım belirteci, aynı açık dosya/oturum, özgün tanımın artık bulunmaması ve tüketilmemiş aktarım birlikte doğrulanırsa mümkündür. | Doğrulanan taşımada eski dış başvurular çalışmayı sürdürür. Koşullar yoksa normal kopya kuralları uygulanır; HTML'deki bir `sourceDocumentId` iddiası tek başına yeterli değildir. |
| Şablondan yeni belge / açık çoğaltma komutu | Belge kimliği dahil bütün sahip olunan tanımlar klonlanır. | İç ilişkilerin tamamı aynı planla yeniden eşlenir. |
| Kaydet/aç, sürüm geri yükle, bilinen modelin tam dosya açılışı | Geçerli benzersiz kimlikler korunur. | Aynı kaydın iç ilişkileri korunur; dosya açma bir birleştirme işlemi değildir. |

Normal içerik yapıştırması bütün belge zarfını veya bölüm havuzunu hedef belgenin üstüne yazamaz. Bölüm sınırı içermeyen bir fragman, hedef bölümde kalır. Bölüm ayarlarını da yapıştırmak A1'de açık ayrı politika gerektirir. Aynı belge içindeki bir kaynak kaydına başvuran atıf kopyası mevcut kaynağı kullanabilir; dış belgeden gelen kaynak açıkça eşleştirilmedikçe yeni kaynak kaydı olur.

Gelecek uygulama akışı: fragmanın tanımlarını ve gereken bağlı kayıtlarını topla → `planDocumentIdentities` ile planla → yalnız gelen fragman/kayıtlardaki iç kenarları yeniden yaz → dış kenarları kanıtlı politika ile çöz → tek transaction ile ekle. Hedef belgedeki mevcut alanlar gelen kimlik eşlemesine göre topluca yeniden yazılmaz. Belirsiz kaynak kimliği olan fragman, yanlış hedefe bağlanmak yerine açık tanı taşır.

## DOCX kimlik sınırı

- Native not numarası, bookmark adı, ilişki kimliği ve parça adı kaynak-format takma adlarıdır. İçe aktarma eşleme anahtarı en az `(importSession, partUri, entityKind, nativeId)` içerir. `footnotes.xml` içindeki `4` ile `endnotes.xml` içindeki `4` aynı nesne sayılmaz.
- Geçerli EDTR model verisi varsa doğrudan export/import kimlikleri koruyabilir. OOXML alan talimatları ve native bookmark/not ilişkileri yine gerçek düzenlenebilir Word nesneleri olarak yazılır; yalnız özel JSON'a bağlı görünür işlev oluşturulmaz.
- A1'de native `_edtrsec…` yer imlerinin doğru bölüm terminallerinde Word Online düzenleme/indirme sonrasında kaldığı ölçüldü. İçe aktarma ancak bütün sınırlar ve son bölüm için eksiksiz, geçerli, benzersiz bir küme varsa bu bölüm kimliklerini kullanır; kısmi/bozuk kümede tamamını yeniler. Bu, bütün nesne türlerinin veya özel model parçalarının Word tarafından korunduğu iddiası değildir.
- Özel metadata yoksa native ilişkiler aynı import oturumunda yeni iç kimliklere eşlenir. Kimlik yenilenmesi raporlanır; görünür metin benzerliğiyle eski kimlikler tahmin edilmez. Görünür içerik/bağlantı eşdeğerliği ile birebir iç kimlik korunması ayrı kabul sonuçlarıdır.
- Geçici biçimlendirme/export bookmarkları kullanıcı hedef havuzuna alınmaz ve son pakette bırakılmaz. Kaynağın başka parçalarındaki kimlikler yalnız o parçanın kapsamıyla yorumlanır.

## İnceleme ve A1 çıkış kapısı

A0 yardımcı testleri: `node scripts/check-document-identity.cjs`. On odaklı test tür doğrulama, kalıtılan nesne anahtarlarının tür olarak reddi, çakışma tekrarı/başarısızlığı, gelecek tanımın kimliğini çalmama, girdi değişmezliği, yinelenen kaynak kimliğinin belirsizliği, klonlanan altgraf, hedef belge çakışması ve göç sonrası idempotansı doğrular. Bunlar entegrasyon veya Word eşleşmesi kanıtı değildir.

A1 uygulanırken ayrıca eski sürüm 0 örnekleri, yeni sürüm idempotansı, bütün yükleme girişleri, bölüm ekleme/silme ve indeksli üstbilgi/marjin geçişi, kaynak değiştirmeden başarısız migration, bilinmeyen gelecek sürüm, belge değiştirme/undo yalıtımı ve sürüm geri yükleme sınanır. A4'te fragman içi/dışı hedefler, yinelenen ID, güvenilir/güvenilmez kes-yapıştır ve silinen hedef; A5/A6'da bağlı kayıt klonlama testleri eklenir. Terra'nın sentetik fixture markerları içerik kanıtıdır; kimlik yerine kullanılmaz.

Onaylanan bölüm temsili A1'de uygulandı: `sectionEndId` mevcut üst düzey paragraf/blok sonunda, `finalSectionId` belge modelindedir. İç içe bölüm sınırı güvenli biçimde temsil edilemiyorsa kaynak yükleme veya sınırı listeye taşıyan düzenleme açıkça reddedilir. Sıradan sınır paragrafı silme, takip eden bölüm ayarlarını korur ve silinen bölümlerden devralınmış üst/altbilgiyi soldan sağa somutlaştırır; undo bütün grafı geri getirir. A2 model doğrulamaları Word görsel uyumluluğu yerine geçmez; ölçüm ve açık işler ayrı destek matrisinde tutulur.
