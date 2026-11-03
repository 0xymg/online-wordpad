/** UI labels only; changing UI locale never changes document bibliography locale. */
const labels: Record<string, Record<string,string>> = {
  "Source data cannot be restored from this Word file. The open document was kept.": {
    tr: "Bu Word dosyasındaki kaynak bilgileri geri yüklenemiyor. Açık belge korundu.",
    fr: "Impossible de restaurer les sources de ce fichier Word. Le document ouvert a été conservé.",
    zh: "无法从此 Word 文件恢复来源信息。已保留当前打开的文档。",
    ar: "تعذرت استعادة المصادر من ملف Word هذا. تم الاحتفاظ بالمستند المفتوح."
  },
"Source type and title are required":{"tr": "Kaynak türü ve başlık gerekli", "fr": "Le type et le titre de la source sont obligatoires", "zh": "请填写来源类型和标题", "ar": "نوع المصدر وعنوانه مطلوبان"},
"Invalid calendar date":{"tr": "Geçersiz takvim tarihi", "fr": "Date non valide", "zh": "日期无效", "ar": "تاريخ غير صالح"},
"Invalid source name":{"tr": "Geçersiz kaynak yazarı veya editörü", "fr": "Nom d’auteur ou de responsable éditorial non valide", "zh": "作者或编者姓名无效", "ar": "اسم المؤلف أو المحرر غير صالح"},
"Invalid source URL":{"tr": "Geçersiz kaynak URL’si", "fr": "URL de source non valide", "zh": "来源网址无效", "ar": "رابط المصدر غير صالح"},
"Invalid source field":{"tr": "Geçersiz kaynak alanı", "fr": "Champ de source non valide", "zh": "来源字段无效", "ar": "حقل المصدر غير صالح"},
"Citation source is missing or repeated":{"tr": "Atıf kaynağı eksik veya yinelenmiş", "fr": "Source de citation absente ou répétée", "zh": "引用来源缺失或重复", "ar": "مصدر الاستشهاد مفقود أو مكرر"},
"Invalid citation text":{"tr": "Geçersiz atıf metni", "fr": "Texte de citation non valide", "zh": "引用文字无效", "ar": "نص الاستشهاد غير صالح"},
"Invalid locator label":{"tr": "Geçersiz konum türü", "fr": "Type d’emplacement non valide", "zh": "位置类型无效", "ar": "نوع الموضع غير صالح"},

"Missing publisher":{"tr":"Yayınevi eksik","fr":"Maison d’édition manquante","zh":"缺少出版社","ar":"الناشر غير محدد"},
"Missing journal title":{"tr":"Dergi adı eksik","fr":"Titre de revue manquant","zh":"缺少期刊名称","ar":"اسم الدورية غير محدد"},
"Missing URL":{"tr":"URL eksik","fr":"URL manquante","zh":"缺少网址","ar":"رابط المصدر غير محدد"},
  "Finish composing text first.": {
    "tr": "Önce metin girişini tamamla.",
    "fr": "Terminez d’abord la saisie.",
    "zh": "请先完成文字输入。",
    "ar": "أكمل إدخال النص أولاً."
  },
  "The operation could not be applied.": {
    "tr": "İşlem uygulanamadı.",
    "fr": "Impossible d’appliquer cette opération.",
    "zh": "无法执行此操作。",
    "ar": "تعذّر تطبيق العملية."
  },
  "Sources and bibliography": {
    "tr": "Kaynaklar ve kaynakça",
    "fr": "Sources et bibliographie",
    "zh": "来源与参考文献",
    "ar": "المصادر والمراجع"
  },
  "Add books, journal articles and webpages; cite them using APA 7 or IEEE.": {
    "tr": "Kitap, dergi makalesi ve web kaynaklarını ekle; APA 7 veya IEEE ile atıf yap.",
    "fr": "Ajoutez des livres, articles et pages web ; citez-les en APA 7 ou IEEE.",
    "zh": "添加书籍、期刊文章和网页，使用 APA 7 或 IEEE 引用。",
    "ar": "أضف الكتب ومقالات الدوريات وصفحات الويب واستشهد بها باستخدام APA 7 أو IEEE."
  },
  "Style": {
    "tr": "Stil",
    "fr": "Style",
    "zh": "样式",
    "ar": "النمط"
  },
  "Bibliography language": {
    "tr": "Kaynakça dili",
    "fr": "Langue de la bibliographie",
    "zh": "参考文献语言",
    "ar": "لغة المراجع"
  },
  "Include uncited sources": {
    "tr": "Kullanılmayan kaynakları da ekle",
    "fr": "Inclure les sources non citées",
    "zh": "包括未引用的来源",
    "ar": "تضمين المصادر غير المستشهد بها"
  },
  "New source": {
    "tr": "Yeni kaynak",
    "fr": "Nouvelle source",
    "zh": "新建来源",
    "ar": "مصدر جديد"
  },
  "Source type": {
    "tr": "Kaynak türü",
    "fr": "Type de source",
    "zh": "来源类型",
    "ar": "نوع المصدر"
  },
  "Book": {
    "tr": "Kitap",
    "fr": "Livre",
    "zh": "书籍",
    "ar": "كتاب"
  },
  "Journal article": {
    "tr": "Dergi makalesi",
    "fr": "Article de revue",
    "zh": "期刊文章",
    "ar": "مقالة دورية"
  },
  "Webpage": {
    "tr": "Web sayfası",
    "fr": "Page web",
    "zh": "网页",
    "ar": "صفحة ويب"
  },
  "Title": {
    "tr": "Başlık",
    "fr": "Titre",
    "zh": "标题",
    "ar": "العنوان"
  },
  "Journal / website title": {
    "tr": "Dergi / site adı",
    "fr": "Titre de la revue / du site",
    "zh": "期刊 / 网站名称",
    "ar": "اسم الدورية / الموقع"
  },
  "Year": {
    "tr": "Yayın yılı",
    "fr": "Année",
    "zh": "年",
    "ar": "السنة"
  },
  "Month": {
    "tr": "Ay",
    "fr": "Mois",
    "zh": "月",
    "ar": "الشهر"
  },
  "Day": {
    "tr": "Gün",
    "fr": "Jour",
    "zh": "日",
    "ar": "اليوم"
  },
  "Publisher": {
    "tr": "Yayınevi",
    "fr": "Maison d’édition",
    "zh": "出版社",
    "ar": "الناشر"
  },
  "Publisher place": {
    "tr": "Yayın yeri",
    "fr": "Lieu de publication",
    "zh": "出版地",
    "ar": "مكان النشر"
  },
  "Edition": {
    "tr": "Baskı",
    "fr": "Édition",
    "zh": "版次",
    "ar": "الطبعة"
  },
  "Volume": {
    "tr": "Cilt",
    "fr": "Volume",
    "zh": "卷",
    "ar": "المجلد"
  },
  "Issue": {
    "tr": "Sayı",
    "fr": "Numéro",
    "zh": "期",
    "ar": "العدد"
  },
  "Pages": {
    "tr": "Sayfalar",
    "fr": "Pages",
    "zh": "页码",
    "ar": "الصفحات"
  },
  "Source language": {
    "tr": "Kaynağın dili",
    "fr": "Langue de la source",
    "zh": "来源语言",
    "ar": "لغة المصدر"
  },
  "Access date": {
    "tr": "Erişim tarihi",
    "fr": "Date de consultation",
    "zh": "访问日期",
    "ar": "تاريخ الاطلاع"
  },
  "Authors (in order)": {
    "tr": "Yazarlar (sırayla)",
    "fr": "Auteurs (dans l’ordre)",
    "zh": "作者（按顺序）",
    "ar": "المؤلفون (بالترتيب)"
  },
  "Person": {
    "tr": "Kişi",
    "fr": "Personne",
    "zh": "个人",
    "ar": "شخص"
  },
  "Organization": {
    "tr": "Kurum",
    "fr": "Organisation",
    "zh": "机构",
    "ar": "مؤسسة"
  },
  "Family name": {
    "tr": "Soyadı",
    "fr": "Nom de famille",
    "zh": "姓",
    "ar": "اسم العائلة"
  },
  "Given name": {
    "tr": "Adı",
    "fr": "Prénom",
    "zh": "名",
    "ar": "الاسم الأول"
  },
  "Organization name": {
    "tr": "Kurum adı",
    "fr": "Nom de l’organisation",
    "zh": "机构名称",
    "ar": "اسم المؤسسة"
  },
  "Add author": {
    "tr": "Yazar ekle",
    "fr": "Ajouter un auteur",
    "zh": "添加作者",
    "ar": "إضافة مؤلف"
  },
  "Citations: ": {
    "tr": "Atıf sayısı: ",
    "fr": "Citations : ",
    "zh": "引用次数：",
    "ar": "عدد الاستشهادات: "
  },
  "Save source": {
    "tr": "Kaynağı kaydet",
    "fr": "Enregistrer la source",
    "zh": "保存来源",
    "ar": "حفظ المصدر"
  },
  "Delete source": {
    "tr": "Kaynağı sil",
    "fr": "Supprimer la source",
    "zh": "删除来源",
    "ar": "حذف المصدر"
  },
  "Citation cluster": {
    "tr": "Atıf kümesi",
    "fr": "Groupe de citations",
    "zh": "引用组",
    "ar": "مجموعة الاستشهادات"
  },
  "Locator": {
    "tr": "Sayfa / konum",
    "fr": "Page / emplacement",
    "zh": "页码 / 位置",
    "ar": "الصفحة / الموضع"
  },
  "Prefix": {
    "tr": "Ön ek",
    "fr": "Préfixe",
    "zh": "前缀",
    "ar": "بادئة"
  },
  "Suffix": {
    "tr": "Son ek",
    "fr": "Suffixe",
    "zh": "后缀",
    "ar": "لاحقة"
  },
  "Suppress author": {
    "tr": "Yazarı atıfta gösterme",
    "fr": "Masquer l’auteur",
    "zh": "隐藏作者",
    "ar": "إخفاء المؤلف"
  },
  "Update citation": {
    "tr": "Atfı güncelle",
    "fr": "Modifier la citation",
    "zh": "更新引用",
    "ar": "تحديث الاستشهاد"
  },
  "Insert citation": {
    "tr": "Atıf ekle",
    "fr": "Insérer une citation",
    "zh": "插入引用",
    "ar": "إدراج استشهاد"
  },
  "Delete citation": {
    "tr": "Atfı sil",
    "fr": "Supprimer la citation",
    "zh": "删除引用",
    "ar": "حذف الاستشهاد"
  },
  "Insert bibliography": {
    "tr": "Kaynakça ekle",
    "fr": "Insérer la bibliographie",
    "zh": "插入参考文献",
    "ar": "إدراج المراجع"
  },
  "Editors (in order)": {
    "tr": "Editörler (sırayla)",
    "fr": "Responsables éditoriaux (dans l’ordre)",
    "zh": "编者（按顺序）",
    "ar": "المحررون (بالترتيب)"
  },
  "Add editor": {
    "tr": "Editör ekle",
    "fr": "Ajouter un responsable éditorial",
    "zh": "添加编者",
    "ar": "إضافة محرر"
  },
  "Remove name": {
    "tr": "Adı kaldır",
    "fr": "Supprimer ce nom",
    "zh": "移除姓名",
    "ar": "إزالة الاسم"
  },
  "Name type": {
    "tr": "Ad türü",
    "fr": "Type de nom",
    "zh": "姓名类型",
    "ar": "نوع الاسم"
  },
  "Name particle": {
    "tr": "Soyadı ön eki",
    "fr": "Particule du nom",
    "zh": "姓氏前缀",
    "ar": "أداة الاسم"
  },
  "Locator type": {
    "tr": "Konum türü",
    "fr": "Type d’emplacement",
    "zh": "位置类型",
    "ar": "نوع الموضع"
  },
  "Page": {
    "tr": "Sayfa",
    "fr": "Page",
    "zh": "页",
    "ar": "صفحة"
  },
  "Chapter": {
    "tr": "Bölüm",
    "fr": "Chapitre",
    "zh": "章",
    "ar": "فصل"
  },
  "Section": {
    "tr": "Kısım",
    "fr": "Section",
    "zh": "节",
    "ar": "قسم"
  },
  "Notices": {
    "tr": "Bildirimler",
    "fr": "Mentions légales",
    "zh": "声明",
    "ar": "الإشعارات"
  },
  "Source": {
    "tr": "Kaynak kodu",
    "fr": "Code source",
    "zh": "源代码",
    "ar": "الشيفرة المصدرية"
  },
  "Missing author": {
    "tr": "Yazar eksik",
    "fr": "Auteur manquant",
    "zh": "缺少作者",
    "ar": "المؤلف غير محدد"
  },
  "No publication date": {
    "tr": "Yayın tarihi yok",
    "fr": "Date de publication absente",
    "zh": "无出版日期",
    "ar": "تاريخ النشر غير محدد"
  }
};
export function bibliographyLabel(locale:string,key:string):string {return labels[key]?.[locale] || key;}
