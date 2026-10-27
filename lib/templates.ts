// Built-in document templates for File > New from Template and the start screen.
//
// HTML must only use nodes the editor schema understands
// (p, h1–h4, ul/ol/li, table/th/td, blockquote, hr) and inline styles it can
// parse back into marks: color, background-color, font-size, font-family, plus
// text-align on block nodes. Anything else is dropped silently on import, so
// keep the formatting to that set.
//
// Sizes are in pt to match the editor's font-size control.

export type DocTemplate = {
  id: string;
  name: string;
  description: string;
  html: string;
};

/** Shared accent used for headings and rules across the templates. */
const ACCENT = "#1f4e79";
const MUTED = "#5b6b7c";

export const TEMPLATES: DocTemplate[] = [
  {
    id: "business-letter",
    name: "Business Letter",
    description: "Formal letter with sender block, date, and closing",
    html: `
      <p><span style="font-size:14pt"><strong>[Your Name]</strong></span></p>
      <p><span style="font-size:10pt;color:${MUTED}">[Street Address]<br/>[City, State ZIP]<br/>[email@example.com] · [+1 555 0100]</span></p>
      <hr/>
      <p style="text-align:right">[Month D, YYYY]</p>
      <p><strong>[Recipient Name]</strong><br/>[Title]<br/>[Company]<br/>[Address]</p>
      <p>Dear [Recipient Name],</p>
      <p>I am writing to [state the purpose in one sentence — an application, a request, a complaint, or a follow-up]. [Add a sentence of context so the reader immediately understands why this letter matters to them.]</p>
      <p>[Second paragraph: the details. Give dates, names, amounts, or reference numbers. Keep each paragraph to a single point so the letter stays easy to scan.]</p>
      <p>[Third paragraph: state clearly what you would like to happen next, and by when.]</p>
      <p>Thank you for your time and consideration. I look forward to your reply.</p>
      <p>Sincerely,</p>
      <p><br/></p>
      <p><strong>[Your Name]</strong><br/><span style="font-size:10pt;color:${MUTED}">[Title]</span></p>
    `,
  },
  {
    id: "cover-letter",
    name: "Cover Letter",
    description: "Job application letter that pairs with your resume",
    html: `
      <p style="text-align:center"><span style="font-size:20pt;color:${ACCENT}"><strong>[Your Name]</strong></span></p>
      <p style="text-align:center"><span style="font-size:10pt;color:${MUTED}">[City, Country] · [email@example.com] · [+1 555 0100] · [linkedin.com/in/you]</span></p>
      <hr/>
      <p style="text-align:right">[Month D, YYYY]</p>
      <p><strong>[Hiring Manager Name]</strong><br/>[Company]</p>
      <p>Dear [Hiring Manager Name],</p>
      <p>I am applying for the <strong>[Job Title]</strong> role at [Company]. [One sentence on why this company and this role specifically — mention something concrete you admire about their work.]</p>
      <p>In my current role at [Company], I [describe your most relevant achievement, with a number if you have one: "cut page load time by 40%" beats "improved performance"]. [Add a second sentence connecting that achievement to what the job posting asks for.]</p>
      <p>Beyond the technical fit, [what you bring to a team — how you work with others, what people come to you for]. [Close this paragraph by naming the specific problem you would like to help them solve.]</p>
      <p>I would welcome the chance to talk about how I can contribute to [team or product name]. Thank you for your time.</p>
      <p>Best regards,</p>
      <p><strong>[Your Name]</strong></p>
    `,
  },
  {
    id: "resume",
    name: "Resume / CV",
    description: "Clean one-page resume with experience and skills",
    html: `
      <p style="text-align:center"><span style="font-size:22pt;color:${ACCENT}"><strong>[YOUR NAME]</strong></span></p>
      <p style="text-align:center"><span style="font-size:11pt;color:${MUTED}">[Job Title You Want]</span></p>
      <p style="text-align:center"><span style="font-size:10pt">[City] · [email@example.com] · [+1 555 0100] · [portfolio.com]</span></p>
      <hr/>
      <h2><span style="color:${ACCENT}">Summary</span></h2>
      <p>[Two or three sentences: your years of experience, the areas you know best, and the kind of role you are looking for. Write it last — it is easier once the rest is filled in.]</p>
      <h2><span style="color:${ACCENT}">Experience</span></h2>
      <p><strong>[Job Title]</strong> — [Company], [City]<br/><span style="font-size:10pt;color:${MUTED}">[Mon YYYY] – [Mon YYYY]</span></p>
      <ul>
        <li>[Achievement with a measurable result — what changed because you were there.]</li>
        <li>[A project you owned end to end, and what it produced.]</li>
        <li>[A tool, system, or process you introduced or improved.]</li>
      </ul>
      <p><strong>[Job Title]</strong> — [Company], [City]<br/><span style="font-size:10pt;color:${MUTED}">[Mon YYYY] – [Mon YYYY]</span></p>
      <ul>
        <li>[Achievement with a measurable result.]</li>
        <li>[Responsibility that shows scope: team size, budget, or user count.]</li>
      </ul>
      <h2><span style="color:${ACCENT}">Education</span></h2>
      <p><strong>[Degree]</strong> — [School], [City]<br/><span style="font-size:10pt;color:${MUTED}">[Year]</span></p>
      <h2><span style="color:${ACCENT}">Skills</span></h2>
      <ul>
        <li><strong>Technical:</strong> [tools, languages, platforms]</li>
        <li><strong>Languages:</strong> [English (fluent), Turkish (native)]</li>
      </ul>
    `,
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    description: "Agenda, decisions, and owned action items",
    html: `
      <h1><span style="color:${ACCENT}">[Meeting Title]</span></h1>
      <table>
        <tbody>
          <tr><th>Date</th><td>[Month D, YYYY · HH:MM]</td></tr>
          <tr><th>Attendees</th><td>[Names]</td></tr>
          <tr><th>Location</th><td>[Room or video link]</td></tr>
          <tr><th>Note taker</th><td>[Name]</td></tr>
        </tbody>
      </table>
      <h2>Agenda</h2>
      <ol>
        <li>[First topic] — [owner], [minutes]</li>
        <li>[Second topic] — [owner], [minutes]</li>
        <li>[Third topic] — [owner], [minutes]</li>
      </ol>
      <h2>Discussion</h2>
      <p><strong>[First topic]</strong><br/>[What was said, what options were weighed, and what concerns were raised.]</p>
      <p><strong>[Second topic]</strong><br/>[Key points and open questions.]</p>
      <h2>Decisions</h2>
      <ul>
        <li>[Decision made] — decided by [name]</li>
        <li>[Decision made] — decided by [name]</li>
      </ul>
      <h2>Action Items</h2>
      <table>
        <tbody>
          <tr><th>Task</th><th>Owner</th><th>Due</th></tr>
          <tr><td>[What needs doing]</td><td>[Name]</td><td>[Date]</td></tr>
          <tr><td>[What needs doing]</td><td>[Name]</td><td>[Date]</td></tr>
        </tbody>
      </table>
      <h2>Next Meeting</h2>
      <p>[Date and time] — [topics carried over]</p>
    `,
  },
  {
    id: "invoice",
    name: "Invoice",
    description: "Billing document with an itemized table and totals",
    html: `
      <p><span style="font-size:28pt;color:${ACCENT}"><strong>INVOICE</strong></span></p>
      <hr/>
      <table>
        <tbody>
          <tr>
            <td><strong>[Your Business Name]</strong><br/><span style="font-size:10pt;color:${MUTED}">[Address]<br/>[City, State ZIP]<br/>[email@example.com]<br/>[Tax ID / VAT]</span></td>
            <td><strong>Bill to</strong><br/><span style="font-size:10pt;color:${MUTED}">[Client Name]<br/>[Company]<br/>[Address]<br/>[email@example.com]</span></td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr><th>Invoice #</th><th>Issue date</th><th>Due date</th><th>Terms</th></tr>
          <tr><td>[INV-001]</td><td>[Month D, YYYY]</td><td>[Month D, YYYY]</td><td>[Net 30]</td></tr>
        </tbody>
      </table>
      <h2>Items</h2>
      <table>
        <tbody>
          <tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr>
          <tr><td>[Service or product]</td><td>1</td><td>[0.00]</td><td>[0.00]</td></tr>
          <tr><td>[Service or product]</td><td>1</td><td>[0.00]</td><td>[0.00]</td></tr>
          <tr><td>[Service or product]</td><td>1</td><td>[0.00]</td><td>[0.00]</td></tr>
          <tr><td></td><td></td><td>Subtotal</td><td>[0.00]</td></tr>
          <tr><td></td><td></td><td>Tax [0%]</td><td>[0.00]</td></tr>
          <tr><td></td><td></td><td><strong>Total due</strong></td><td><strong>[0.00]</strong></td></tr>
        </tbody>
      </table>
      <h2>Payment</h2>
      <p><span style="font-size:10pt">[Bank name] · IBAN [XX00 0000 0000 0000] · [Payment link]<br/>Please reference invoice [INV-001] with your payment.</span></p>
      <p><span style="font-size:10pt;color:${MUTED}">Thank you for your business.</span></p>
    `,
  },
  {
    id: "report",
    name: "Report / Essay",
    description: "Structured report with findings and conclusion",
    html: `
      <p style="text-align:center"><span style="font-size:24pt;color:${ACCENT}"><strong>[Report Title]</strong></span></p>
      <p style="text-align:center"><span style="font-size:11pt;color:${MUTED}">[Subtitle or one-line summary]</span></p>
      <p style="text-align:center"><span style="font-size:10pt">[Author] · [Month D, YYYY]</span></p>
      <hr/>
      <h2><span style="color:${ACCENT}">Executive Summary</span></h2>
      <p>[Three or four sentences a busy reader could use on their own: what you looked at, what you found, and what you recommend.]</p>
      <h2><span style="color:${ACCENT}">1. Introduction</span></h2>
      <p>[State the question or problem, why it matters, and what this report covers. Name anything you deliberately left out of scope.]</p>
      <h2><span style="color:${ACCENT}">2. Background</span></h2>
      <p>[The context a reader needs before the findings will make sense — history, prior work, or how things work today.]</p>
      <h2><span style="color:${ACCENT}">3. Method</span></h2>
      <p>[How you gathered the evidence: sources, sample size, dates, tools. Enough that someone could repeat it.]</p>
      <h2><span style="color:${ACCENT}">4. Findings</span></h2>
      <p>[Lead with the most important finding. Use a table when comparing numbers.]</p>
      <table>
        <tbody>
          <tr><th>Metric</th><th>Before</th><th>After</th><th>Change</th></tr>
          <tr><td>[Metric]</td><td>[0]</td><td>[0]</td><td>[+0%]</td></tr>
          <tr><td>[Metric]</td><td>[0]</td><td>[0]</td><td>[+0%]</td></tr>
        </tbody>
      </table>
      <h2><span style="color:${ACCENT}">5. Conclusion &amp; Recommendations</span></h2>
      <ol>
        <li>[Recommendation] — [who should act, and by when]</li>
        <li>[Recommendation] — [who should act, and by when]</li>
      </ol>
      <blockquote>[The one sentence you want the reader to remember.]</blockquote>
      <h2><span style="color:${ACCENT}">References</span></h2>
      <p><span style="font-size:10pt">[Author, Title, Publisher, Year.]<br/>[Author, Title, Publisher, Year.]</span></p>
    `,
  },
  {
    id: "project-plan",
    name: "Project Plan",
    description: "Scope, milestones, owners, and risks",
    html: `
      <h1><span style="color:${ACCENT}">[Project Name]</span></h1>
      <p><span style="font-size:10pt;color:${MUTED}">Owner: [Name] · Updated: [Month D, YYYY] · Status: [On track]</span></p>
      <hr/>
      <h2>Goal</h2>
      <p>[One sentence describing what will be true when this project is done. Make it something you can check, not something you can argue about.]</p>
      <h2>Scope</h2>
      <p><strong>In scope</strong></p>
      <ul>
        <li>[What this project will deliver]</li>
        <li>[What this project will deliver]</li>
      </ul>
      <p><strong>Out of scope</strong></p>
      <ul>
        <li>[What this project deliberately will not cover]</li>
      </ul>
      <h2>Milestones</h2>
      <table>
        <tbody>
          <tr><th>Milestone</th><th>Owner</th><th>Target date</th><th>Status</th></tr>
          <tr><td>[Kickoff]</td><td>[Name]</td><td>[Date]</td><td>[Done]</td></tr>
          <tr><td>[First deliverable]</td><td>[Name]</td><td>[Date]</td><td>[In progress]</td></tr>
          <tr><td>[Launch]</td><td>[Name]</td><td>[Date]</td><td>[Not started]</td></tr>
        </tbody>
      </table>
      <h2>Risks</h2>
      <table>
        <tbody>
          <tr><th>Risk</th><th>Impact</th><th>Mitigation</th></tr>
          <tr><td>[What could go wrong]</td><td>[High / Medium / Low]</td><td>[What we will do about it]</td></tr>
          <tr><td>[What could go wrong]</td><td>[High / Medium / Low]</td><td>[What we will do about it]</td></tr>
        </tbody>
      </table>
      <h2>Open Questions</h2>
      <ul>
        <li>[Question] — needs an answer from [name] by [date]</li>
      </ul>
    `,
  },
  {
    id: "todo-list",
    name: "To-Do List",
    description: "Weekly task list grouped by priority",
    html: `
      <h1><span style="color:${ACCENT}">To-Do List</span></h1>
      <p><span style="font-size:10pt;color:${MUTED}">Week of [Month D, YYYY]</span></p>
      <hr/>
      <h2>Today</h2>
      <ul>
        <li>[The one thing that matters most today]</li>
        <li>[Second task]</li>
        <li>[Third task]</li>
      </ul>
      <h2>This Week</h2>
      <ul>
        <li>[Task] — due [day]</li>
        <li>[Task] — due [day]</li>
        <li>[Task] — due [day]</li>
      </ul>
      <h2>Waiting On</h2>
      <ul>
        <li>[What you are blocked on] — from [name], asked [date]</li>
      </ul>
      <h2>Later / Someday</h2>
      <ul>
        <li>[Idea worth revisiting]</li>
        <li>[Idea worth revisiting]</li>
      </ul>
      <hr/>
      <p><span style="font-size:10pt;color:${MUTED}">Done this week: [list what you finished — it helps on the days that feel unproductive.]</span></p>
    `,
  },
];

// Arabic starter documents use Arabic placeholders as well as translated cards.
const ARABIC_TEMPLATES: Record<string, Pick<DocTemplate, "name" | "description" | "html">> = {
  "business-letter": {
    name: "رسالة رسمية", description: "رسالة رسمية مع بيانات المرسل والتاريخ والتحية الختامية",
    html: `<p><strong>[اسمك]</strong><br/>[العنوان]<br/>[البريد الإلكتروني] · [رقم الهاتف]</p><hr/><p>[التاريخ]</p><p><strong>[اسم المستلم]</strong><br/>[المسمى الوظيفي]<br/>[الشركة والعنوان]</p><p>السيد/السيدة [اسم المستلم] المحترم/المحترمة،</p><p><strong>الموضوع: [موضوع الرسالة]</strong></p><p>أكتب إليكم بشأن [الغرض من الرسالة]. [اذكر السياق باختصار.]</p><p>[أضف التفاصيل والتواريخ والمبالغ أو الأرقام المرجعية ذات الصلة.]</p><p>[وضّح الإجراء المطلوب والموعد المناسب للرد.]</p><p>شكرًا لوقتكم واهتمامكم، وأتطلع إلى ردكم.</p><p>وتفضلوا بقبول فائق الاحترام،</p><p><strong>[اسمك]</strong><br/>[المسمى الوظيفي]</p>`,
  },
  "cover-letter": {
    name: "خطاب تقديم لوظيفة", description: "خطاب طلب توظيف يرافق سيرتك الذاتية",
    html: `<h1>[اسمك]</h1><p>[المدينة، الدولة] · [البريد الإلكتروني] · [رقم الهاتف]</p><hr/><p>[التاريخ]</p><p><strong>[اسم مسؤول التوظيف]</strong><br/>[اسم الشركة]</p><p>السيد/السيدة [اسم المسؤول] المحترم/المحترمة،</p><p>أتقدم لشغل وظيفة <strong>[المسمى الوظيفي]</strong> لدى [الشركة]. [اذكر سبب اهتمامك بالشركة والدور.]</p><p>في عملي الحالي لدى [الشركة]، [صف إنجازًا ذا صلة مع نتيجة قابلة للقياس]. [اربط خبرتك بمتطلبات الوظيفة.]</p><p>[وضّح ما ستضيفه إلى الفريق وطريقتك في العمل.]</p><p>يسعدني مناقشة كيفية مساهمتي في [الفريق أو المشروع]. شكرًا لوقتكم واهتمامكم.</p><p>مع خالص التقدير،<br/><strong>[اسمك]</strong></p>`,
  },
  resume: {
    name: "سيرة ذاتية", description: "سيرة ذاتية موجزة تعرض الخبرات والمهارات",
    html: `<h1>[اسمك الكامل]</h1><p>[المسمى الوظيفي]</p><p>[المدينة] · [البريد الإلكتروني] · [رقم الهاتف] · [رابط أعمالك]</p><hr/><h2>الملخص المهني</h2><p>[اكتب ملخصًا عن خبرتك وتخصصك ونوع الوظيفة التي تبحث عنها.]</p><h2>الخبرات العملية</h2><p><strong>[المسمى الوظيفي]</strong> — [الشركة، المدينة]<br/>[تاريخ البدء] – [تاريخ الانتهاء أو حتى الآن]</p><ul><li>[إنجاز ونتيجته القابلة للقياس.]</li><li>[مشروع توليت مسؤوليته والنتائج التي حققها.]</li></ul><h2>التعليم</h2><p><strong>[المؤهل والتخصص]</strong> — [الجامعة]<br/>[سنة التخرج]</p><h2>المهارات</h2><p>[المهارات والأدوات ذات الصلة]</p><h2>اللغات</h2><p>[اللغة ومستوى الإتقان]</p>`,
  },
  "meeting-notes": {
    name: "محضر اجتماع", description: "جدول الأعمال والقرارات والمهام والمسؤولون عنها",
    html: `<h1>محضر اجتماع: [الموضوع]</h1><p><strong>التاريخ:</strong> [التاريخ والوقت]<br/><strong>المكان:</strong> [المكان أو رابط الاجتماع]<br/><strong>الحضور:</strong> [الأسماء]</p><h2>جدول الأعمال</h2><ol><li>[البند الأول]</li><li>[البند الثاني]</li></ol><h2>ملخص المناقشة</h2><p>[لخّص النقاط الرئيسية والأسئلة المفتوحة.]</p><h2>القرارات</h2><ul><li>[القرار وسبب اتخاذه.]</li></ul><h2>المهام</h2><table><tbody><tr><th>المهمة</th><th>المسؤول</th><th>الموعد النهائي</th></tr><tr><td>[وصف المهمة]</td><td>[الاسم]</td><td>[التاريخ]</td></tr></tbody></table><h2>الاجتماع القادم</h2><p>[الموعد والموضوعات المقترحة]</p>`,
  },
  invoice: {
    name: "فاتورة", description: "فاتورة تتضمن بنودًا تفصيلية وإجمالي المبلغ",
    html: `<h1>فاتورة</h1><p><strong>[اسم النشاط التجاري]</strong><br/>[العنوان]<br/>[بيانات التواصل]</p><p><strong>رقم الفاتورة:</strong> [الرقم]<br/><strong>تاريخ الإصدار:</strong> [التاريخ]<br/><strong>تاريخ الاستحقاق:</strong> [التاريخ]</p><h2>بيانات العميل</h2><p>[اسم العميل]<br/>[العنوان]</p><table><tbody><tr><th>البيان</th><th>الكمية</th><th>سعر الوحدة</th><th>المبلغ</th></tr><tr><td>[الخدمة أو المنتج]</td><td>[الكمية]</td><td>[السعر]</td><td>[المبلغ]</td></tr></tbody></table><p><strong>المجموع الفرعي:</strong> [المبلغ]<br/><strong>الضريبة إن وجدت:</strong> [المبلغ]<br/><strong>الإجمالي:</strong> [المبلغ والعملة]</p><h2>طريقة الدفع</h2><p>[بيانات الدفع والمرجع المطلوب]</p><p>شكرًا لتعاملكم معنا.</p>`,
  },
  report: {
    name: "تقرير / مقال", description: "تقرير منظّم يتضمن النتائج والخلاصة",
    html: `<h1>[عنوان التقرير]</h1><p>[اسم الكاتب]<br/>[التاريخ]</p><hr/><h2>الملخص</h2><p>[لخّص الغرض والنتائج الرئيسية والتوصية في فقرة قصيرة.]</p><h2>المقدمة</h2><p>[وضّح الخلفية والسؤال الذي يتناوله التقرير وحدوده.]</p><h2>المنهجية</h2><p>[اشرح مصادر المعلومات وطريقة التحليل.]</p><h2>النتائج</h2><h3>[النتيجة الأولى]</h3><p>[اعرض النتيجة مع أدلتها.]</p><h3>[النتيجة الثانية]</h3><p>[اعرض النتيجة مع أدلتها.]</p><h2>الخلاصة والتوصيات</h2><p>[اذكر الاستنتاجات والخطوات المقترحة.]</p><h2>المراجع</h2><ol><li>[المصدر، العنوان، التاريخ، الرابط]</li></ol>`,
  },
  "project-plan": {
    name: "خطة مشروع", description: "نطاق المشروع ومراحله والمسؤوليات والمخاطر",
    html: `<h1>خطة مشروع: [الاسم]</h1><p><strong>مدير المشروع:</strong> [الاسم]<br/><strong>الفترة:</strong> [تاريخ البدء] – [تاريخ الانتهاء]</p><h2>الهدف ومعايير النجاح</h2><p>[اذكر الهدف والنتائج القابلة للقياس.]</p><h2>نطاق المشروع</h2><ul><li>[ما يشمله المشروع]</li><li>[ما يقع خارج النطاق]</li></ul><h2>المراحل الرئيسية</h2><table><tbody><tr><th>المرحلة</th><th>المسؤول</th><th>الموعد</th></tr><tr><td>[المرحلة والمخرج المتوقع]</td><td>[الاسم]</td><td>[التاريخ]</td></tr></tbody></table><h2>الموارد والميزانية</h2><p>[الفريق والأدوات والتكاليف المتوقعة]</p><h2>المخاطر</h2><table><tbody><tr><th>الخطر</th><th>الأثر</th><th>خطة التعامل</th></tr><tr><td>[الخطر]</td><td>[الأثر المتوقع]</td><td>[الإجراء والمسؤول]</td></tr></tbody></table><h2>المتابعة</h2><p>[مواعيد المتابعة وطريقة الإبلاغ عن التقدم]</p>`,
  },
  "todo-list": {
    name: "قائمة مهام", description: "مهام أسبوعية مرتبة حسب الأولوية",
    html: `<h1>قائمة مهام الأسبوع</h1><p>[تاريخ بداية الأسبوع]</p><h2>أولوية عالية</h2><ul><li>☐ [المهمة والموعد النهائي]</li><li>☐ [المهمة والموعد النهائي]</li></ul><h2>أولوية متوسطة</h2><ul><li>☐ [المهمة]</li><li>☐ [المهمة]</li></ul><h2>عند توفر الوقت</h2><ul><li>☐ [المهمة]</li></ul><h2>ملاحظات</h2><p>[تذكيرات أو عقبات أو متابعات]</p><h2>تم الإنجاز</h2><ul><li>☑ [مهمة مكتملة]</li></ul>`,
  },
};

export function getTemplates(locale: string): DocTemplate[] {
  return locale === "ar" ? TEMPLATES.map((template) => ({ ...template, ...ARABIC_TEMPLATES[template.id] })) : TEMPLATES;
}
