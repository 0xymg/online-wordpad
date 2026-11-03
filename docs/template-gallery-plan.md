# Word şablonları — kapsam düzeltmesi

Durum: **Genel şablon galerisi önerisi geçersiz kılındı; onaylanmadı ve uygulanmayacak.**

Kullanıcı açıklaması: “Word şablonlarını kendi belgelerime birebir aktaralım.” İstenen, kullanıcının seçtiği Word şablonlarının kişisel belge kopyalarıdır. EDTRDocs’un herkese açık şablon kataloğunu genişletme veya Microsoft galerisini uygulamada yeniden dağıtma işi değildir.

## Geçerli kişisel aktarım kapsamı

- Ana ajan, Word Online’daki seçili şablonlardan kullanıcının kendi hesabında belge kopyaları oluşturma ve kaynak DOCX dosyalarını alma akışını yürütür.
- Kaynak DOCX değiştirilmeden saklanır. Editöre aktarılan sürüm, bu kaynağın yerine geçen tek kopya olmaz.
- “Birebir” sonucu dosyanın açılmasıyla varsayılmaz. Seçilen her örnek için Word Online görünümü ve mümkünse Word’ün ürettiği PDF; EDTRDocs görünümü, PDF ve yeniden dışa aktarılan DOCX ile karşılaştırılır.
- Metin, yer tutucular, görseller, sayfa boyutu/yönü, kenar boşlukları, üst/altbilgi, tablo ve nesne yerleşimi kontrol edilir. Desteklenmeyen içerik veya düzen farkı açıkça kaydedilir; kaynak dosya korunur.
- Referans uygulama Word Online’dır. Karşılaştırma tarihi, fontlar ve sayfa ayarları referans kaydına eklenir.
- Giriş, şablon seçimi ve indirme işini ana ajan yürütür. Bu dosya ek bir kullanıcı onay kapısı oluşturmaz.

## Bu görevde yapılmayacaklar

- `lib/templates.ts` veya uygulamanın şablon galerisinde değişiklik.
- Genel galeri, yeni kategori/arama/önizleme arayüzü veya yeni yerelleştirilmiş şablon paketi.
- Toplu indirme, herkese açık varlık çoğaltma veya kişisel kopyaları uygulama kataloğuna ekleme.

## İlk incelemede görülen mevcut durum

Bu notlar yalnız kişisel aktarımın teknik sınırlarını anlamak içindir; galeri uygulaması kararı değildir.

- `lib/templates.ts` on yerleşik HTML başlangıç belgesi içeriyor. Arapça kart ve gövde varyantları var; diğer diller mevcut İngilizce içerikleri kullanıyor.
- Başlangıç ekranı yatay şablon şeridi, File menüsü düz bir şablon listesi sunuyor. Bunlar kişisel Word dosyası aktarımından bağımsız.
- `lib/doc-import.ts` DOCX dosyasını metin kutusu ve biçim koruma adımlarından, ardından Mammoth dönüşümünden geçiriyor. Açılabilen dosya ile tüm Word özelliklerinin modelde düzenlenebilir olması aynı sonuç değil.
- Yerleşik şablon küçük resimleri gerçek sayfalama motorunu kullanmıyor; sabit A4 ölçüsü ve ayrı CSS ile çiziliyor. Bu küçük resimler Word eşleşmesi kanıtı olarak kullanılmayacak.
- Çok sütunlu akış, referanslar ve ileri Word uyumluluğu için [ileri belge planı](advanced-document-plan.md) geçerlidir. Kişisel bir şablonda bu özellikler varsa, fark ilgili örneğin kaydında belirtilecek.

## Yapılan işlem

Word Online galerisinden altı kişisel belge kopyası oluşturuldu: Net ve zarif özgeçmiş, Ön yazı, Fatura, Kalın logolu antetli kağıt, Toplantı tutanağı ve APA raporu. Kaynak DOCX dosyaları değiştirilmeden indirildi ve yerel `EDTR-Word-Sablonlari.zip` paketinde SHA/ZIP bütünlüğü doğrulandı. Ayrı LibreOffice önizlemeleri yaklaşık olarak etiketlendi. APA kaynak şablonu APA 6 içeriği taşıyor; APA 7 uyumu iddia edilmiyor. Uygulamanın genel şablon galerisi değiştirilmedi. EDTRDocs içinde birebir yerleşim sağlandığı iddia edilmez; ileri uyumluluk değerlendirmesi ayrı planda sürer.


Altı kaynak ayrıca boş, izole EDTRDocs oturumlarında açıldı ve HTML/DOCX/PDF çıktıları alındı. Normalize edilmiş gövde metni sırası altısında da korundu; tablo ve metin kutusu sayıları eşleşti. Yaklaşık LibreOffice önizlemelerine göre özgeçmiş 3→6, toplantı tutanağı 2→3 sayfaya çıktı ve bazı dekoratif şekiller kayboldu. Bu karşılaştırma gerçek Word görsel eşleşmesi kanıtı değildir. Kişisel rapor ve türetilmiş çıktılar Downloads içinde ayrı uyumluluk paketindedir; özgün altı DOCX ve özgün ZIP byte düzeyinde değiştirilmemiştir. Kişisel dosyalar depoya eklenmedi.
