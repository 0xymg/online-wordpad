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
