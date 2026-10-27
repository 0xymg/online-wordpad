export const SITE_URL = "https://wordpad.info";

export const SOCIAL_IMAGE = {
  url: `${SITE_URL}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: "EDTRpad — Free Online Word Processor",
};

// Both pages publish the same complete set, including self-references.
// Generic Arabic remains available alongside the Saudi audience annotation.
export const LANDING_LANGUAGES = {
  en: SITE_URL,
  ar: `${SITE_URL}/ar`,
  "ar-SA": `${SITE_URL}/ar`,
  "x-default": SITE_URL,
};

export const ARABIC_LANDING_TITLE = "وورد أون لاين مجاني بالعربية — محرر نصوص | EDTRpad";
export const ARABIC_LANDING_DESCRIPTION =
  "اكتب ونسّق مستنداتك بالعربية مع EDTRpad، بديل وورد وWordPad المجاني أون لاين. افتح ملفات Word وصدّر PDF مع دعم الكتابة من اليمين إلى اليسار، بدون تحميل أو تسجيل.";
