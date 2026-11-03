# Görsel yerleşimi geliştirme planı

## Hedef ve çalışma şekli

Görseli seçme, yerleştirme, sıralama ve dışa aktarma davranışları birlikte tutarlı çalışacak. Yeni özellikler aşağıdaki bağımlılık sırasıyla, ayrı ve doğrulanabilir paketler olarak tamamlanacak.

- Kullanıcının son yönlendirmesiyle kalan 3–5 aşamaları Sol/Terra ajanlarında ayrı dosya sahiplikleriyle paralel geliştiriliyor. Bütünleştirme ve kabul sırası 3 → 4 → 5; ortak dosya değişiklikleri ana ajan tarafından koordine edilir. Tüm etkilenen kabul testleri geçmeden yayın yapılmaz.
- Bir aşama ancak kabul ölçütleri karşılandığında tamamlandı sayılır. Yerelde hazır, yayında ve canlıda doğrulandı durumları ayrı tutulur.
- Yeni fikirler doğrudan uygulamaya eklenmez; aşağıdaki bekleyen işler bölümüne yazılır. Sıra değişirse gerekçesi burada kaydedilir.
- Commit'lere co-author eklenmez. Üretim yayını `main` üzerinden Vercel Git entegrasyonuyla yapılır.
- Görsel konumu ve sırası belge modelinde tutulur. Araç çubuğu, görsel menüsü, panel ve dışa aktarma aynı veriyi kullanır. Geçici sürükleme görüntüsü belgeye kaydedilmez.

## Başlangıç durumu

- `c864046`: metin kaydırma seçenekleri, boyut/uzaklık ayarı, ortak hizalama, seçim/klavye düzeltmeleri ve geliştirme önbelleği düzeltmesi canlıda doğrulandı.
- `fa15be6`: bağlı paragrafın sayfasına göre sabit X/Y, görseller arası katman sırası, Word aktarımı ve PDF düzeltmesi canlıda doğrulandı.
- Mevcut sabitleme belirli bir mutlak sayfa numarasını kilitlemez; görselin bağlı olduğu paragrafın sayfasını esas alır.

## Aşamalar

| Sıra | Paket | Durum | Bağımlılık / sonuç |
| --- | --- | --- | --- |
| 1 | Aynı sayfada sürükleyerek konumlandırma | Tamamlandı — `f85dc4d`, canlıda doğrulandı | Mevcut sabit konum modelini doğrudan kullanma |
| 2 | Görsel katman paneli | Tamamlandı — `22962a1`, canlıda doğrulandı | Üstü örtülmüş görselleri erişilebilir şekilde seçme ve sıralama |
| 3 | Metnin önüne / arkasına yerleştirme | Tamamlandı — `a4b214f`, canlıda doğrulandı | Arkadaki görselin panelden seçilebilmesi için 2 tamamlanmalı |
| 4 | Sayfalar arasında sürükleme | Tamamlandı — `a4b214f`, canlıda doğrulandı | Sayfa ve paragraf bağlantısını güvenilir biçimde değiştirme |
| 5 | Metin kutuları | Tamamlandı — `a4b214f`, canlıda doğrulandı | Görsellerde doğrulanan seçim, konum ve katman davranışını kullanma |

### 1. Aynı sayfada sürükleme

Kapsam: görsel gövdesinden fare/dokunma sürüklemesi; tıklama ile seçim; köşelerden mevcut boyutlandırma. Metin akışındaki görsel bırakılınca sayfaya göre sabit konuma geçer. Görselin mevcut katman sırası korunur.

Kabul ölçütleri:

- Zoom ve kaydırma sırasında görüntü tutulan noktayı takip eder; sayfa sınırları içinde kalır.
- Bırakma tek geri alma işlemidir. Escape, pointercancel veya belge değişimi geçici görüntüyü temizler ve belgeyi değiştirmez.
- Sıradan tıklama yerleşimi değiştirmez. Yerleşim iki görsel oluşturmaz; Delete/Backspace ile seçim silinebilir.
- Doğal sayfa sınırında sonraki sayfaya itilmiş görsel, akıştan ayrılırken önceki sayfaya düşmez; ilgili sayfa başlangıcı aynı geri alma işleminde korunur.
- Kaydet/aç, hizalama, katman, boyutlandırma, Word ve PDF davranışı korunur.

Doğrulama: `scripts/check-image-drag.cjs`, mevcut `scripts/check-image-layout.cjs` ve `scripts/check-page-images.cjs`; üretim derlemesi; yayın sonrası gerçek siteye karşı sürükleme testi.

### 2. Görsel katman paneli

Kapsam: belgedeki tüm görsellerin küçük önizlemeli listesi; alt metin veya "Görsel 1" gibi anlaşılır ad; seçili görselin iki yönlü işaretlenmesi; panelden görsele gitme; sabit görsellerin mevcut öne/arkaya sırasını değiştirme. Metin akışındaki görseller listelenebilir ve seçilebilir; katman sırası ancak sabit konumda uygulanır.

Kabul ölçütleri:

- Tamamen başka bir görselin altında kalan görsel panelden seçilebilir ve yerleşim kontrolleri açılabilir.
- Editörde seçim, ekleme, silme, geri alma ve belge değiştirme paneli günceller; eski belgeye işlem yapılmaz.
- Panelden seçim görselin çizildiği yere gider; sıfır boyutlu paragraf bağlantısına kaydırmakla yetinmez.
- Sıralama tek geri alma işlemidir; kaydet/aç ve Word/PDF çıktısı sıralamayı korur.
- Klavye ile kullanılabilir; açık/koyu tema ve dar ekranlarda belge düzenlemeyi engellemez.

Doğrulama: `scripts/check-image-layers.cjs` üstü kapalı görsele erişim, panel/editör seçimi, sıralama, geri alma/silme, belge değiştirme ve dar ekranı sınar. Ortak katman komutu için `scripts/check-page-images.cjs` Word/PDF regresyonu korunur.

Bu pakete gizleme, kilitleme, gruplama, çoklu seçim veya yeniden adlandırma eklenmez.

### 3. Metnin önüne / arkasına yerleştirme

Kapsam: sabit görseller için açıkça adlandırılmış ön/arka metin düzlemi. Görsellerin kendi aralarındaki sıra bu seçimden ayrı kalır.

Kabul ölçütleri:

- Arkadaki görsel metin yazmayı ve metin seçimini engellemez; panelden her zaman tekrar seçilebilir.
- Seçim tutamaçları ve görsel menüsü erişilebilir kalır; katmanlar uygulama araç çubuğunun üzerine çıkmaz.
- Ayar tek geri alma işlemi ve kalıcı belge verisidir.
- Editör, salt okunur görünüm, yazdırma/PDF ve DOCX `behindDoc` davranışı aynı sonucu verir.
- Ön/arka geçişi ve üst üste gelen metin/görsel örnekleri ayrı olarak doğrulanır.

### 4. Sayfalar arasında sürükleme

Kapsam: var olan başka bir sayfaya görsel taşıma; sürükleme sırasında kenarlarda kaydırma; hedef sayfa önizlemesi ve doğru paragraf bağlantısı.

Kabul ölçütleri:

- Bırakma hedef sayfanın boyut ve kenar boşluklarına göre hesaplanır; farklı yön/boyuttaki bölümler desteklenir.
- Taşıma sonunda bir görsel kalır; metin kaybolmaz. Bağlantı ve konum değişikliği birlikte tek işlemde geri alınır.
- Hedef geçersizse veya işlem iptal edilirse belge aynı kalır.
- Kaydet/aç ve Word/PDF yeniden aktarımı hedef sayfayı korur.

Boş alana bırakarak yeni sayfa oluşturma bu aşamanın kapsamına otomatik olarak dahil değildir. İlk sürümde akış içindeki bir görselin kaldırılması aradaki paragraf veya tabloyu bölen doğal sayfa sınırını değiştirecekse hedef kırmızı/geçersiz gösterilir ve bırakma iptal edilir; görsel yanlış sayfaya sessizce taşınmaz. Üst düzey paragraf sınırları korunur; zaten sabit görseller bu akış yüksekliği kısıtına tabi değildir.

### 5. Metin kutuları

Önce belge modeli ve DOCX temsilinin tasarımı yazılır. İlk kapsam: tek kutuda metin düzenleme, sayfada konumlandırma, boyutlandırma ve katman panelinden seçim.

Kabul ölçütleri:

- Kutunun içindeki metin düzenleme ile kutuyu taşıma/boyutlandırma birbirine karışmaz.
- Taşan metin davranışı açık ve tutarlıdır; içerik sessizce kaybolmaz.
- Geri alma, kalıcılık, klavye erişimi, yazdırma/PDF ve DOCX aktarımının destek sınırları tasarımda belirtilir ve test edilir.

Bağlı metin kutuları, dönen metin, gruplama ve şekiller ilk pakete dahil değildir.

## Her yayın için kapanış

1. Kapsamı ve değişiklikleri kontrol et; ilgili kabul ölçütlerini test et.
2. Değişen kod için TypeScript/uygun lint kontrolü ve üretim derlemesini tamamla. Bilinen mevcut lint uyarılarını yeni hatalarla karıştırma.
3. Co-author olmadan commit/push yap; Vercel durumunun başarılı olduğunu doğrula.
4. Canlı sitede izole test belgesiyle değişen akışı kontrol et; kullanıcının belgesini test verisi olarak değiştirme.
5. Bu dosyanın durum ve kanıt bölümünü güncelle. Sonraki pakete ancak bundan sonra geç.

## Kanıt ve sonraki işlem

- Aşama 1 yerelde: sürükleme, tek tıklama, akıştan sabit konuma geçiş, Escape, geri alma/yeniden yapma, %50 zoom, kenar sınırları, kalıcılık, ikinci sayfa, katman ve silme testleri geçti. Ek pointercancel, kaydırma ve dokunma olayları da doğrulandı.
- Mevcut yerleşim, boyutlandırma, Word ve PDF regresyonları geçti.
- Aşama 1 yayını: `f85dc4d`; üretim derlemesi ve Vercel yayını başarılı. `BASE_URL=https://wordpad.info` ile `scripts/check-image-drag.cjs` canlıda geçti.
- Aşama 2 yerelde tamamlandı: View → Image layers girişi, örtülü görsel seçimi, ortak sıralama komutu, seçim/silme/geri alma ve belge değişimi senkronu, klavye, açık/koyu tema ve dar ekran kontrolleri geçti.
- Aşama 2 doğrulama: `scripts/check-image-layers.cjs`, `scripts/check-page-images.cjs`, TypeScript, yeni panel/yardımcı/diyalog için odaklı lint ve üretim derlemesi başarılı. Editor/MenuBar içinde önceden var olan lint bulguları değişmedi.
- Aşama 2 yayını: `22962a1`; Vercel yayını başarılı. `BASE_URL=https://wordpad.info` ile `scripts/check-image-layers.cjs` canlıda geçti; örtülü görsele erişim, ortak sıralama, klavye, kalıcılık ve mobil görünüm doğrulandı.
- Kullanıcı kalan tüm paketlerin Sol/Terra ajanlarında geliştirilmesini istedi. 3–5 paralel geliştirme, sıralı entegrasyon ve ortak regresyon kapısıyla ilerliyor.
- Bölüm düzenleyicisi, referanslar ve ileri Word uyumluluğu ayrı `docs/advanced-document-plan.md` planında; kullanıcı kapsamı ve sırayı 2 Kasım 2026 tarihinde onayladı. Uygulama bu görsel/metin kutusu paketi canlıda doğrulandıktan sonra A0 ile başlayacak.

- Aşama 3 yerelde: `scripts/check-image-text-plane.cjs` gerçek ön/arka piksel karşılaştırması, görsel içinden metin yazma, seçim tutamaçları, düzlem/sıra, tek geri alma, HTML/DOCX döngüsü ve PDF raster karşılaştırmalarında geçti.
- Aşama 4 yerelde: `scripts/check-image-cross-page.cjs` ileri/geri taşıma, zoom, otomatik kaydırma, iptal/geçersiz hedef, doğal sayfa sınırı, farklı yön/marjinli bölümler ve native Word anchor gidiş-dönüşünde geçti.
- Aşama 5 yerelde: `docs/text-box-design.md` tasarımı uygulandı. `scripts/check-text-boxes.cjs` Insert, Delete/Backspace, ayrı metin düzenleme/taşıma, boyutlandırma, geri alma, kayıt, native düzenlenebilir DOCX ve PDF, taşma uyarısı, örtülü/arkadaki kutu seçimi ve beş dilde arayüz/dar ekran (Arapça RTL dahil) kontrollerinde geçti. İlk kapsam düz çok satırlı metin; zengin metin, döndürme ve bağlı kutular kapsam dışı.
- Ortak Katmanlar paneli görselleri ve metin kutularını birlikte sıralar. `scripts/check-image-layers.cjs` karma seçim/sıralama ve Word döngüsünde geçti; DOCX z-sırası tekrar içe alımda kaymıyor.
- Mevcut `check-image-layout.cjs` ve `check-page-images.cjs` regresyonları geçti. Metin kutusu PDF’si ayrıca rasterleştirilerek görsel olarak kontrol edildi. Üretim derlemesi/TypeScript ve odaklı lint başarılı (doc-export içindeki mevcut üç unused-import uyarısı dışında yeni bulgu yok).
- 3–5 yayını: `a4b214f`, co-author olmadan commit/push; Vercel başarılı. `BASE_URL=https://wordpad.info` ile `check-image-cross-page.cjs`, `check-image-text-plane.cjs`, `check-image-layers.cjs` ve `check-text-boxes.cjs` canlıda geçti. Paket kapandı; onaylı ileri belge planında A0 başladı.

## Bekleyen fikirler

Henüz sıraya alınmış ek iş yok. Yeni talepler buraya yazılır; aktif paketin kapsamını kendiliğinden genişletmez.
