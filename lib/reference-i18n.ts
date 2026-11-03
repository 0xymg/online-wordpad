import type { Locale } from './i18n';
const en = {
  importUnsupported: 'This document contains reference fields that cannot be imported safely. The original file has not been changed.',
  bookmark: 'Bookmark', caption: 'Caption', reference: 'Cross-reference', toc: 'Table of contents',
  bookmarkHint: 'Name the selected text so references can follow it when it moves.',
  captionHint: 'Add a numbered caption after the current paragraph.',
  referenceHint: 'Link to a heading, bookmark or caption. The result updates as the document changes.',
  tocHint: 'Choose the heading levels to include. Titles and page numbers update automatically.',
  name: 'Bookmark name', label: 'Caption label', text: 'Caption text', target: 'Target', display: 'Show',
  targetText: 'Target text', number: 'Number', page: 'Page number', levels: 'Heading levels',
  heading: 'Heading', title: 'Title', figure: 'Figure', table: 'Table', cancel: 'Cancel', insert: 'Insert',
  apply: 'Apply', go: 'Go to target', empty: 'Add a heading, bookmark or caption first.',
  failed: 'This change could not be applied. Check the selection and target.',
  changed: 'The document or selected reference changed. Close and reopen this dialog.',
  missing: 'Target not found', ambiguous: 'More than one target has this identity', unsupported: 'Unsupported reference',
  pending: 'Updating references…', layoutError: 'References could not finish updating. Check the document layout before exporting.',
  update: 'Update references', updated: 'References updated', selectLevel: 'Select at least one heading level.',
};
type Labels = { [K in keyof typeof en]: string };
const labels: Record<Locale, Labels> = {
 en,
 tr: {
  importUnsupported:'Bu belgede güvenle içe aktarılamayan referans alanları var. Özgün dosya değiştirilmedi.',
  bookmark:'Yer imi',caption:'Açıklama',reference:'Çapraz referans',toc:'İçindekiler',
  bookmarkHint:'Seçili metne ad verin; referanslar metin taşındığında onu izlesin.',captionHint:'Geçerli paragraftan sonra numaralı bir açıklama ekleyin.',
  referenceHint:'Bir başlığa, yer imine veya açıklamaya bağlanın. Sonuç belge değiştikçe güncellenir.',tocHint:'Dahil edilecek başlık düzeylerini seçin. Başlıklar ve sayfa numaraları otomatik güncellenir.',
  name:'Yer imi adı',label:'Açıklama etiketi',text:'Açıklama metni',target:'Hedef',display:'Göster',targetText:'Hedef metni',number:'Numara',page:'Sayfa numarası',levels:'Başlık düzeyleri',heading:'Başlık',title:'Başlık metni',figure:'Şekil',table:'Tablo',cancel:'İptal',insert:'Ekle',apply:'Uygula',go:'Hedefe git',empty:'Önce bir başlık, yer imi veya açıklama ekleyin.',failed:'Değişiklik uygulanamadı. Seçimi ve hedefi kontrol edin.',changed:'Belge veya seçili referans değişti. Pencereyi kapatıp yeniden açın.',missing:'Hedef bulunamadı',ambiguous:'Bu kimlikte birden fazla hedef var',unsupported:'Desteklenmeyen referans',pending:'Referanslar güncelleniyor…',layoutError:'Referanslar güncellenemedi. Dışa aktarmadan önce belge düzenini kontrol edin.',update:'Referansları güncelle',updated:'Referanslar güncellendi',selectLevel:'En az bir başlık düzeyi seçin.',
 },
 fr: {
  importUnsupported:'Ce document contient des champs de référence qui ne peuvent pas être importés sans perte. Le fichier original n’a pas été modifié.',
  bookmark:'Signet',caption:'Légende',reference:'Renvoi',toc:'Table des matières',bookmarkHint:'Nommez le texte sélectionné pour que les renvois suivent ses déplacements.',captionHint:'Ajoutez une légende numérotée après le paragraphe actuel.',referenceHint:'Créez un renvoi vers un titre, un signet ou une légende. Le résultat suit les modifications du document.',tocHint:'Choisissez les niveaux de titre. Les titres et numéros de page sont actualisés automatiquement.',name:'Nom du signet',label:'Étiquette de légende',text:'Texte de légende',target:'Cible',display:'Afficher',targetText:'Texte de la cible',number:'Numéro',page:'Numéro de page',levels:'Niveaux de titre',heading:'Titre',title:'Titre de la table',figure:'Figure',table:'Tableau',cancel:'Annuler',insert:'Insérer',apply:'Appliquer',go:'Aller à la cible',empty:'Ajoutez d’abord un titre, un signet ou une légende.',failed:'Modification impossible. Vérifiez la sélection et la cible.',changed:'Le document ou le renvoi a changé. Fermez puis rouvrez cette fenêtre.',missing:'Cible introuvable',ambiguous:'Plusieurs cibles portent cette identité',unsupported:'Renvoi non pris en charge',pending:'Actualisation des renvois…',layoutError:'Les renvois n’ont pas pu être actualisés. Vérifiez la mise en page avant l’exportation.',update:'Actualiser les renvois',updated:'Renvois actualisés',selectLevel:'Sélectionnez au moins un niveau de titre.',
 },
 zh: {
  importUnsupported:'此文档包含无法安全导入的引用域。原始文件未被更改。',
  bookmark:'书签',caption:'题注',reference:'交叉引用',toc:'目录',bookmarkHint:'为所选文字命名，让引用随文字移动。',captionHint:'在当前段落后添加带编号的题注。',referenceHint:'引用标题、书签或题注。结果随文档变化自动更新。',tocHint:'选择要包含的标题级别。标题和页码会自动更新。',name:'书签名称',label:'题注标签',text:'题注文字',target:'目标',display:'显示',targetText:'目标文字',number:'编号',page:'页码',levels:'标题级别',heading:'标题',title:'目录标题',figure:'图',table:'表',cancel:'取消',insert:'插入',apply:'应用',go:'转到目标',empty:'请先添加标题、书签或题注。',failed:'无法应用更改。请检查选区和目标。',changed:'文档或所选引用已更改。请关闭并重新打开此对话框。',missing:'找不到目标',ambiguous:'多个目标具有相同标识',unsupported:'不支持的引用',pending:'正在更新引用…',layoutError:'引用未能完成更新。导出前请检查文档布局。',update:'更新引用',updated:'引用已更新',selectLevel:'请至少选择一个标题级别。',
 },
 ar: {
  importUnsupported:'يحتوي هذا المستند على حقول مرجعية لا يمكن استيرادها بأمان. لم يُعدّل الملف الأصلي.',
  bookmark:'إشارة مرجعية',caption:'تسمية توضيحية',reference:'إسناد ترافقي',toc:'جدول المحتويات',bookmarkHint:'سمِّ النص المحدد لتتبعه الإسنادات عند نقله.',captionHint:'أضف تسمية توضيحية مرقمة بعد الفقرة الحالية.',referenceHint:'اربط بعنوان أو إشارة مرجعية أو تسمية توضيحية. تتحدث النتيجة مع تغيّر المستند.',tocHint:'اختر مستويات العناوين. تتحدث العناوين وأرقام الصفحات تلقائيًا.',name:'اسم الإشارة المرجعية',label:'نوع التسمية',text:'نص التسمية',target:'الهدف',display:'إظهار',targetText:'نص الهدف',number:'الرقم',page:'رقم الصفحة',levels:'مستويات العناوين',heading:'عنوان',title:'عنوان الجدول',figure:'شكل',table:'جدول',cancel:'إلغاء',insert:'إدراج',apply:'تطبيق',go:'الانتقال إلى الهدف',empty:'أضف عنوانًا أو إشارة مرجعية أو تسمية توضيحية أولًا.',failed:'تعذر تطبيق التغيير. تحقق من التحديد والهدف.',changed:'تغيّر المستند أو الإسناد المحدد. أغلق هذه النافذة ثم افتحها مجددًا.',missing:'لم يُعثر على الهدف',ambiguous:'توجد عدة أهداف بهذه الهوية',unsupported:'إسناد غير مدعوم',pending:'جارٍ تحديث الإسنادات…',layoutError:'تعذر إكمال تحديث الإسنادات. تحقق من تخطيط المستند قبل التصدير.',update:'تحديث الإسنادات',updated:'تم تحديث الإسنادات',selectLevel:'اختر مستوى عنوان واحدًا على الأقل.',
 },
};
export const referenceLabels = (locale: Locale): Labels => labels[locale];
