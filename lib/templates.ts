// Built-in document templates for File > New from Template.
// HTML must only use nodes the editor schema understands
// (p, h1–h3, ul/ol/li, table/th/td, blockquote, hr).

export type DocTemplate = {
  id: string;
  name: string;
  description: string;
  html: string;
};

export const TEMPLATES: DocTemplate[] = [
  {
    id: "business-letter",
    name: "Business Letter",
    description: "Formal letter with sender, date, and closing",
    html: `
      <p>[Your Name]<br/>[Your Address]<br/>[City, State ZIP]<br/>[Email · Phone]</p>
      <p style="text-align:right">[Date]</p>
      <p>[Recipient Name]<br/>[Company]<br/>[Address]</p>
      <p>Dear [Recipient Name],</p>
      <p>I am writing to [state the purpose of your letter — an application, a request, a complaint, or a follow-up]. [Add one or two sentences of context so the reader immediately understands why you are writing.]</p>
      <p>[Second paragraph: provide the details — dates, names, amounts, or references. Keep each paragraph focused on a single point.]</p>
      <p>Thank you for your time and consideration. I look forward to your reply.</p>
      <p>Sincerely,</p>
      <p><strong>[Your Name]</strong></p>
    `,
  },
  {
    id: "resume",
    name: "Resume / CV",
    description: "Clean one-page resume outline",
    html: `
      <h1>[Your Name]</h1>
      <p>[City] · [Email] · [Phone] · [Website or LinkedIn]</p>
      <h2>Summary</h2>
      <p>[Two or three sentences describing your experience, strengths, and what you're looking for.]</p>
      <h2>Experience</h2>
      <p><strong>[Job Title] — [Company]</strong><br/>[Start date] – [End date]</p>
      <ul>
        <li>[Achievement with a measurable result]</li>
        <li>[Responsibility or project you led]</li>
        <li>[Skill or tool you used to deliver impact]</li>
      </ul>
      <p><strong>[Job Title] — [Company]</strong><br/>[Start date] – [End date]</p>
      <ul>
        <li>[Achievement with a measurable result]</li>
        <li>[Responsibility or project you led]</li>
      </ul>
      <h2>Education</h2>
      <p><strong>[Degree] — [School]</strong><br/>[Year]</p>
      <h2>Skills</h2>
      <ul>
        <li>[Skill group: e.g. Languages — English (fluent), Turkish (native)]</li>
        <li>[Tools and technologies]</li>
      </ul>
    `,
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    description: "Agenda, discussion, and action items",
    html: `
      <h1>Meeting Notes</h1>
      <table>
        <tbody>
          <tr><th>Date</th><td>[Date]</td></tr>
          <tr><th>Attendees</th><td>[Names]</td></tr>
          <tr><th>Location</th><td>[Room / video link]</td></tr>
        </tbody>
      </table>
      <h2>Agenda</h2>
      <ol>
        <li>[First topic]</li>
        <li>[Second topic]</li>
        <li>[Third topic]</li>
      </ol>
      <h2>Discussion</h2>
      <p>[Key points, decisions made, and open questions.]</p>
      <h2>Action Items</h2>
      <ul>
        <li>[Task] — owner: [Name], due: [Date]</li>
        <li>[Task] — owner: [Name], due: [Date]</li>
      </ul>
    `,
  },
  {
    id: "invoice",
    name: "Invoice",
    description: "Simple invoice with an items table",
    html: `
      <h1>INVOICE</h1>
      <p><strong>[Your Business Name]</strong><br/>[Address]<br/>[Email · Phone]</p>
      <table>
        <tbody>
          <tr><th>Invoice #</th><td>[001]</td></tr>
          <tr><th>Date</th><td>[Date]</td></tr>
          <tr><th>Due date</th><td>[Date]</td></tr>
        </tbody>
      </table>
      <h2>Bill To</h2>
      <p>[Client Name]<br/>[Company]<br/>[Address]</p>
      <h2>Items</h2>
      <table>
        <tbody>
          <tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr>
          <tr><td>[Service or product]</td><td>1</td><td>[0.00]</td><td>[0.00]</td></tr>
          <tr><td>[Service or product]</td><td>1</td><td>[0.00]</td><td>[0.00]</td></tr>
          <tr><td></td><td></td><td><strong>Total</strong></td><td><strong>[0.00]</strong></td></tr>
        </tbody>
      </table>
      <p>Payment details: [bank / IBAN / payment link]. Thank you for your business.</p>
    `,
  },
  {
    id: "report",
    name: "Report / Essay",
    description: "Structured report with sections",
    html: `
      <h1>[Report Title]</h1>
      <p>[Author] · [Date]</p>
      <h2>Introduction</h2>
      <p>[What is this report about? State the question or problem and why it matters.]</p>
      <h2>Background</h2>
      <p>[Context the reader needs before the findings make sense.]</p>
      <h2>Findings</h2>
      <p>[Present your main points. Use lists or tables for data.]</p>
      <ul>
        <li>[Finding 1]</li>
        <li>[Finding 2]</li>
      </ul>
      <h2>Conclusion</h2>
      <p>[Summarize and state recommendations or next steps.]</p>
      <blockquote>[Optional closing quote or key takeaway.]</blockquote>
    `,
  },
  {
    id: "todo-list",
    name: "To-Do List",
    description: "Prioritized task list for the week",
    html: `
      <h1>To-Do List</h1>
      <p>[Week of …]</p>
      <h2>Today</h2>
      <ul>
        <li>[Most important task]</li>
        <li>[Second task]</li>
      </ul>
      <h2>This Week</h2>
      <ul>
        <li>[Task]</li>
        <li>[Task]</li>
      </ul>
      <h2>Later / Someday</h2>
      <ul>
        <li>[Idea or task to revisit]</li>
      </ul>
    `,
  },
];
