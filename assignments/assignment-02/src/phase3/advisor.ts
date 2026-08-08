import { readFile, writeFile, mkdir, access } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
// @ts-ignore
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { JobPostingSchema, type JobPosting } from "../phase1.js";
import {
  assessLegitimacy,
  type LegitimacyVerdict,
} from "./legitimacy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const RESUME_JSON = path.join(ROOT_DIR, "data", "resume", "resume.json");
const MARKET_JSON = path.join(ROOT_DIR, "data", "analysis", "market-analysis.json");
const GAP_JSON = path.join(ROOT_DIR, "data", "analysis", "gap-analysis.json");
const REPORTS_DIR = path.join(ROOT_DIR, "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "application-report.html");

const MODEL = "google/gemini-2.5-flash-lite";

const VERBOSE =
  process.argv.includes("--verbose") || process.argv.includes("--debug");

function debug(message: string): void {
  if (VERBOSE) {
    console.log(`[DEBUG] ${message}`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const FitScoreSchema = z.object({
  overall_score: z.number(),
  recommendation_label: z.string(),
  met_requirements: z.array(
    z.object({
      requirement: z.string(),
      evidence: z.string(),
    }),
  ),
  gap_requirements: z.array(
    z.object({
      requirement: z.string(),
      severity: z.enum(["minor", "major"]),
    }),
  ),
  score_breakdown: z.string(),
  encouragement: z.string(),
});

export const ResumeAdaptationSchema = z.object({
  specific_changes: z.array(
    z.object({
      section: z.string(),
      current: z.string(),
      suggested: z.string(),
      reason: z.string(),
    }),
  ),
  keywords_to_add: z.array(z.string()),
  keywords_to_remove: z.array(z.string()),
});

export const CoverLetterGuidanceSchema = z.object({
  key_points: z.array(z.string()),
  company_specific_angles: z.array(z.string()),
  gap_addressing_strategies: z.array(z.string()),
  opening_hook: z.string(),
});

export const InterviewPrepSchema = z.object({
  likely_questions: z.array(
    z.object({
      question: z.string(),
      suggested_answer_approach: z.string(),
    }),
  ),
  skills_to_brush_up: z.array(z.string()),
  company_research_topics: z.array(z.string()),
  talking_points: z.array(z.string()),
});

export type FitScore = z.infer<typeof FitScoreSchema>;
export type ResumeAdaptation = z.infer<typeof ResumeAdaptationSchema>;
export type CoverLetterGuidance = z.infer<typeof CoverLetterGuidanceSchema>;
export type InterviewPrep = z.infer<typeof InterviewPrepSchema>;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractEmail(text: string): string | null {
  const match = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );
  return match?.[0] ?? null;
}

function extractDomainHint(
  companyName: string,
  text: string,
  email: string | null,
): string | null {
  if (email?.includes("@")) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && !/gmail|yahoo|hotmail|outlook|icloud|proton/i.test(domain)) {
      return domain;
    }
  }
  const urlMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.(?:com|ca|io|ai|net|org))\b/i,
  );
  if (urlMatch?.[1]) return urlMatch[1].toLowerCase();

  const simplified = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)[0];
  return simplified ? `${simplified}.com` : null;
}

async function parseStructured<T>(
  client: OpenAI,
  schema: z.ZodType<T>,
  name: string,
  system: string,
  user: string,
): Promise<T | null> {
  try {
    const completion = await client.chat.completions.parse({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: zodResponseFormat(schema, name),
    });
    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new Error(`No ${name} returned`);
    return schema.parse(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] ${name} generation failed: ${msg}`);
    return null;
  }
}

function buildHtmlReport(data: {
  job: JobPosting;
  legitimacy: LegitimacyVerdict;
  fit: FitScore | null;
  resumeAdapt: ResumeAdaptation | null;
  coverLetter: CoverLetterGuidance | null;
  interview: InterviewPrep | null;
}): string {
  const { job, legitimacy, fit, resumeAdapt, coverLetter, interview } = data;

  const verdictClass =
    legitimacy.overall_verdict === "GREEN"
      ? "badge-green"
      : legitimacy.overall_verdict === "RED"
        ? "badge-red"
        : "badge-yellow";

  const redBanner =
    legitimacy.overall_verdict === "RED"
      ? `<div class="banner-red">⚠️ WARNING: This posting received a RED legitimacy verdict. Proceed with extreme caution and do not share sensitive personal information.</div>`
      : "";

  const signalIcon = (type: "red" | "green") =>
    type === "green" ? "✅" : "❌";

  const signalsHtml = legitimacy.signals
    .map(
      (s) => `
      <div class="signal signal-${s.type}">
        <div class="signal-icon">${signalIcon(s.type)}</div>
        <div>
          <strong>${escapeHtml(s.description)}</strong>
          <p>${escapeHtml(s.evidence)}</p>
        </div>
      </div>`,
    )
    .join("");

  const whois = legitimacy.whois_summary;
  const whoisHtml = whois
    ? `<div class="whois-card">
        <h3>WHOIS Data</h3>
        <ul>
          <li><strong>Domain:</strong> ${escapeHtml(whois.domain ?? "—")}</li>
          <li><strong>Registered:</strong> ${escapeHtml(whois.registration_date ?? "—")}</li>
          <li><strong>Registrar:</strong> ${escapeHtml(whois.registrar ?? "—")}</li>
          <li><strong>Expires:</strong> ${escapeHtml(whois.expiration_date ?? "—")}</li>
          <li><strong>Organization:</strong> ${escapeHtml(whois.organization ?? "—")}</li>
        </ul>
      </div>`
    : `<div class="whois-card"><h3>WHOIS Data</h3><p>Unavailable</p></div>`;

  const score = fit?.overall_score ?? 0;
  const label = fit?.recommendation_label ?? "Unable to score";
  const metHtml =
    fit?.met_requirements
      .map(
        (m) =>
          `<li><strong>${escapeHtml(m.requirement)}</strong><br><span class="muted">${escapeHtml(m.evidence)}</span></li>`,
      )
      .join("") ?? "<li>Unavailable</li>";

  const gapsHtml =
    fit?.gap_requirements
      .map(
        (g) =>
          `<li class="gap-${g.severity}"><strong>${escapeHtml(g.requirement)}</strong> <span class="tag tag-${g.severity}">${g.severity}</span></li>`,
      )
      .join("") ?? "<li>Unavailable</li>";

  const changesRows =
    resumeAdapt?.specific_changes
      .map(
        (c) => `
      <tr>
        <td>${escapeHtml(c.section)}</td>
        <td class="before">${escapeHtml(c.current)}</td>
        <td class="after">${escapeHtml(c.suggested)}</td>
        <td>${escapeHtml(c.reason)}</td>
      </tr>`,
      )
      .join("") ??
    `<tr><td colspan="4">Resume adaptation unavailable</td></tr>`;

  const keywordsAdd =
    resumeAdapt?.keywords_to_add
      .map((k) => `<span class="chip chip-add">${escapeHtml(k)}</span>`)
      .join("") ?? "";
  const keywordsRemove =
    resumeAdapt?.keywords_to_remove
      .map((k) => `<span class="chip chip-remove">${escapeHtml(k)}</span>`)
      .join("") ?? "";

  const coverKeyPoints =
    coverLetter?.key_points
      .map((p, i) => `<li><strong>${i + 1}.</strong> ${escapeHtml(p)}</li>`)
      .join("") ?? "<li>Unavailable</li>";

  const companyAngles =
    coverLetter?.company_specific_angles
      .map((a) => `<li>${escapeHtml(a)}</li>`)
      .join("") ?? "<li>Unavailable</li>";

  const gapStrategies =
    coverLetter?.gap_addressing_strategies
      .map((a) => `<li>${escapeHtml(a)}</li>`)
      .join("") ?? "<li>Unavailable</li>";

  const questionsHtml =
    interview?.likely_questions
      .map(
        (q, i) => `
      <details class="q-card" ${i === 0 ? "open" : ""}>
        <summary>${escapeHtml(q.question)}</summary>
        <p>${escapeHtml(q.suggested_answer_approach)}</p>
      </details>`,
      )
      .join("") ?? "<p>Unavailable</p>";

  const brushUp =
    interview?.skills_to_brush_up
      .map((s) => `<span class="chip">${escapeHtml(s)}</span>`)
      .join("") ?? "";

  const researchTopics =
    interview?.company_research_topics
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("") ?? "<li>Unavailable</li>";

  const talkingPoints =
    interview?.talking_points
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("") ?? "<li>Unavailable</li>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Application Report — ${escapeHtml(job.job_title)} @ ${escapeHtml(job.company_name)}</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --card: #ffffff;
      --ink: #1a2332;
      --muted: #5b6b7c;
      --line: #e2e8f0;
      --green: #15803d;
      --green-bg: #ecfdf3;
      --red: #b91c1c;
      --red-bg: #fef2f2;
      --yellow: #a16207;
      --yellow-bg: #fffbeb;
      --blue: #1d4ed8;
      --blue-soft: #eff6ff;
      --shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      --radius: 16px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 500px at 10% -10%, #dbeafe 0%, transparent 55%),
        radial-gradient(900px 400px at 100% 0%, #dcfce7 0%, transparent 50%),
        var(--bg);
      line-height: 1.55;
    }
    .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 1.85rem; margin: 0 0 6px; letter-spacing: -0.02em; }
    h2 { font-size: 1.25rem; margin: 0 0 14px; }
    h3 { margin: 0 0 10px; font-size: 1.05rem; }
    .subtitle { color: var(--muted); margin-bottom: 24px; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 22px 24px;
      margin-bottom: 18px;
      box-shadow: var(--shadow);
    }
    .banner-red {
      background: var(--red);
      color: white;
      padding: 14px 18px;
      border-radius: 12px;
      margin-bottom: 18px;
      font-weight: 600;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 999px;
      font-weight: 800;
      letter-spacing: 0.04em;
      font-size: 0.95rem;
    }
    .badge-green { background: var(--green-bg); color: var(--green); }
    .badge-yellow { background: var(--yellow-bg); color: var(--yellow); }
    .badge-red { background: var(--red-bg); color: var(--red); }
    .signal {
      display: flex; gap: 12px; padding: 12px 14px;
      border-radius: 12px; margin-bottom: 10px; border: 1px solid var(--line);
    }
    .signal-green { background: var(--green-bg); }
    .signal-red { background: var(--red-bg); }
    .signal p { margin: 4px 0 0; color: var(--muted); font-size: 0.92rem; }
    .signal-icon { font-size: 1.2rem; line-height: 1.4; }
    .whois-card {
      margin-top: 16px; padding: 14px 16px; background: var(--blue-soft);
      border-radius: 12px; border: 1px solid #bfdbfe;
    }
    .whois-card ul { margin: 0; padding-left: 18px; }
    .rec-box {
      margin-top: 16px; padding: 14px 16px; border-left: 4px solid var(--blue);
      background: #f8fafc; border-radius: 0 12px 12px 0;
    }
    .score-row {
      display: flex; flex-wrap: wrap; align-items: center; gap: 18px; margin-bottom: 16px;
    }
    .score-big { font-size: 2.4rem; font-weight: 800; letter-spacing: -0.03em; }
    .progress {
      flex: 1; min-width: 180px; height: 14px; background: #e2e8f0;
      border-radius: 999px; overflow: hidden;
    }
    .progress > span {
      display: block; height: 100%; background: linear-gradient(90deg, #22c55e, #16a34a);
      width: ${Math.max(0, Math.min(100, score))}%;
    }
    .two-col {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    }
    @media (max-width: 720px) { .two-col { grid-template-columns: 1fr; } }
    .col {
      border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px;
      background: #fafbfc;
    }
    .col.met { border-color: #bbf7d0; background: var(--green-bg); }
    .col.gaps { border-color: #fecaca; background: var(--red-bg); }
    .col ul { margin: 0; padding-left: 18px; }
    .col li { margin-bottom: 10px; }
    .muted { color: var(--muted); font-size: 0.9rem; }
    .tag {
      display: inline-block; font-size: 0.75rem; font-weight: 700;
      padding: 2px 8px; border-radius: 999px; text-transform: uppercase;
    }
    .tag-minor { background: var(--yellow-bg); color: var(--yellow); }
    .tag-major { background: var(--red-bg); color: var(--red); }
    table {
      width: 100%; border-collapse: collapse; font-size: 0.92rem;
    }
    th, td {
      border-bottom: 1px solid var(--line); text-align: left;
      padding: 10px 8px; vertical-align: top;
    }
    th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
    td.before { color: var(--muted); text-decoration: line-through; text-decoration-color: #fca5a5; }
    td.after { color: var(--green); font-weight: 600; }
    .chip {
      display: inline-block; padding: 6px 10px; margin: 0 6px 6px 0;
      border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 0.85rem; font-weight: 600;
    }
    .chip-add { background: var(--green-bg); color: var(--green); }
    .chip-remove {
      background: var(--red-bg); color: var(--red);
      text-decoration: line-through;
    }
    blockquote.hook {
      margin: 0 0 16px; padding: 16px 18px;
      border-left: 4px solid #6366f1; background: #eef2ff;
      border-radius: 0 12px 12px 0; font-style: italic;
    }
    details.q-card {
      border: 1px solid var(--line); border-radius: 12px;
      padding: 10px 14px; margin-bottom: 10px; background: #fff;
    }
    details.q-card summary {
      cursor: pointer; font-weight: 700; outline: none;
    }
    details.q-card p { margin: 10px 0 4px; color: var(--muted); }
    .encourage {
      margin-top: 14px; padding: 14px 16px; border-radius: 12px;
      background: var(--green-bg); border: 1px solid #bbf7d0; color: var(--green);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="wrap">
    ${redBanner}
    <h1>${escapeHtml(job.job_title)}</h1>
    <p class="subtitle">${escapeHtml(job.company_name)} · ${escapeHtml(job.location)} · ${escapeHtml(job.remote_status)}</p>

    <section class="card">
      <h2>1. Legitimacy Assessment</h2>
      <div class="badge ${verdictClass}">${escapeHtml(legitimacy.overall_verdict)} · ${legitimacy.confidence_score}% confidence</div>
      <div style="margin-top:16px">${signalsHtml}</div>
      ${whoisHtml}
      <div class="rec-box"><strong>Recommendation:</strong> ${escapeHtml(legitimacy.recommendation)}</div>
    </section>

    <section class="card">
      <h2>2. Fit Assessment</h2>
      <div class="score-row">
        <div class="score-big">${score}% — ${escapeHtml(label)}</div>
        <div class="progress"><span></span></div>
      </div>
      <div class="two-col">
        <div class="col met">
          <h3>Met Requirements</h3>
          <ul>${metHtml}</ul>
        </div>
        <div class="col gaps">
          <h3>Gaps</h3>
          <ul>${gapsHtml}</ul>
        </div>
      </div>
      <p style="margin-top:14px"><strong>Score breakdown:</strong> ${escapeHtml(fit?.score_breakdown ?? "Unavailable")}</p>
      <div class="encourage">${escapeHtml(fit?.encouragement ?? "Keep applying — every application is practice.")}</div>
    </section>

    <section class="card">
      <h2>3. Resume Adaptation</h2>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr><th>Section</th><th>Before</th><th>After</th><th>Reason</th></tr>
          </thead>
          <tbody>${changesRows}</tbody>
        </table>
      </div>
      <h3 style="margin-top:18px">Keywords to add</h3>
      <div>${keywordsAdd || '<span class="muted">None</span>'}</div>
      <h3 style="margin-top:12px">Keywords to remove / de-emphasize</h3>
      <div>${keywordsRemove || '<span class="muted">None</span>'}</div>
    </section>

    <section class="card">
      <h2>4. Cover Letter Guidance</h2>
      <blockquote class="hook">${escapeHtml(coverLetter?.opening_hook ?? "Unavailable")}</blockquote>
      <h3>Key points</h3>
      <ol style="padding-left:18px;margin:0 0 14px">${coverKeyPoints}</ol>
      <h3>Company-specific angles</h3>
      <ul>${companyAngles}</ul>
      <h3>How to address gaps</h3>
      <ul>${gapStrategies}</ul>
    </section>

    <section class="card">
      <h2>5. Interview Prep</h2>
      <h3>Likely questions</h3>
      ${questionsHtml}
      <h3 style="margin-top:16px">Skills to brush up</h3>
      <div>${brushUp || '<span class="muted">None listed</span>'}</div>
      <h3 style="margin-top:12px">Company research topics</h3>
      <ul>${researchTopics}</ul>
      <h3>Talking points</h3>
      <ul>${talkingPoints}</ul>
    </section>
  </div>
</body>
</html>`;
}

export async function analyzeApplication(
  pdfPath: string,
  options: {
    openrouterApiKey: string;
    tavilyApiKey: string;
  },
): Promise<string> {
  if (!(await fileExists(RESUME_JSON))) {
    throw new Error("Run phase2 first");
  }
  if (!(await fileExists(MARKET_JSON))) {
    throw new Error("Run phase1 first");
  }

  const [resumeRaw, marketRaw, gapRaw] = await Promise.all([
    readFile(RESUME_JSON, "utf-8"),
    readFile(MARKET_JSON, "utf-8"),
    fileExists(GAP_JSON)
      ? readFile(GAP_JSON, "utf-8")
      : Promise.resolve("{}"),
  ]);

  const resume = JSON.parse(resumeRaw) as unknown;
  const market = JSON.parse(marketRaw) as unknown;
  const gap = JSON.parse(gapRaw) as unknown;

  let pdfText: string;
  try {
    const buffer = await readFile(pdfPath);
    const parsed = await pdfParse(buffer);
    pdfText = parsed.text;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`PDF parsing failed: ${msg}`);
  }

  const client = new OpenAI({
    apiKey: options.openrouterApiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });

  let job: JobPosting;
  try {
    const completion = await client.chat.completions.parse({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Extract structured job posting data. Today is ${new Date().toISOString().slice(0, 10)}.
Fill company_research with whatever is inferable from the posting text (web research may be limited here).
Use nulls when unknown. Be thorough with required_skills and preferred_skills.`,
        },
        {
          role: "user",
          content: `Extract structured data from this job posting:\n\n---\n${pdfText}\n---`,
        },
      ],
      response_format: zodResponseFormat(JobPostingSchema, "job_posting"),
    });
    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new Error("No job posting extracted");
    job = JobPostingSchema.parse(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Job extraction failed: ${msg}`);
  }

  debug(`Extracted job: ${job.job_title} at ${job.company_name}`);

  const contactEmail = extractEmail(pdfText);
  const domainHint = extractDomainHint(job.company_name, pdfText, contactEmail);

  let legitimacy: LegitimacyVerdict;
  try {
    legitimacy = await assessLegitimacy(
      {
        company_name: job.company_name,
        job_title: job.job_title,
        location: job.location,
        salary_raw: job.salary_range.raw,
        salary_min: job.salary_range.min,
        salary_max: job.salary_range.max,
        currency: job.salary_range.currency,
        description_excerpt: pdfText,
        contact_email: contactEmail,
        company_domain: domainHint,
        company_research: job.company_research,
      },
      options,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] Legitimacy failed: ${msg}`);
    legitimacy = {
      overall_verdict: "YELLOW",
      confidence_score: 30,
      signals: [
        {
          type: "red",
          description: "Legitimacy check failed",
          evidence: msg,
        },
      ],
      recommendation: "Verify the company manually before applying.",
      whois_summary: null,
    };
  }

  const contextPayload = JSON.stringify(
    { job, resume, market, gap },
    null,
    2,
  );

  const fit = await parseStructured(
    client,
    FitScoreSchema,
    "fit_score",
    `You are an encouraging co-op/internship application coach. Score how well the candidate fits this specific job.
Score 0-100 with a clear recommendation_label (Strong Fit, Good Fit, Stretch, Growth Target, etc.).
Always include an encouraging message — never discourage applying.
Use resume evidence for met_requirements.
Before listing any skill as a gap, carefully check the resume hard_skills, projects technologies, and keywords arrays. If a skill appears anywhere in the resume data, it must be listed as Met Requirements, not a gap. Do not list React, JavaScript, Python, SQL, Node.js, or any skill that appears in resume.hard_skills as a gap.`,
    `Score fit for this application:\n${contextPayload}`,
  );
  if (fit) debug(`Fit score: ${fit.overall_score}%`);

  const resumeAdapt = await parseStructured(
    client,
    ResumeAdaptationSchema,
    "resume_adaptation",
    `Suggest specific resume adaptations tailored to this job posting. Be concrete with before/after wording. Keywords should help ATS matching.
Do not suggest removing core programming languages, frameworks, or tools from the resume even if not in the job posting. Only suggest removing or de-emphasizing truly irrelevant items. Never suggest removing JavaScript, Python, React, Node.js, SQL, Git, or any language that is generally valuable.`,
    `Propose resume adaptations:\n${contextPayload}`,
  );

  const coverLetter = await parseStructured(
    client,
    CoverLetterGuidanceSchema,
    "cover_letter_guidance",
    `Create cover letter guidance for a co-op/intern candidate. Include a strong opening_hook and company-specific angles.`,
    `Create cover letter guidance:\n${contextPayload}`,
  );

  const interview = await parseStructured(
    client,
    InterviewPrepSchema,
    "interview_prep",
    `Prepare interview coaching for this specific role and company. Include likely questions with answer approaches.`,
    `Create interview prep:\n${contextPayload}`,
  );

  debug("Generating HTML report...");
  const html = buildHtmlReport({
    job,
    legitimacy,
    fit,
    resumeAdapt,
    coverLetter,
    interview,
  });

  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(REPORT_PATH, html, "utf-8");
  console.error(`[OK] Wrote ${REPORT_PATH}`);

  return html;
}
