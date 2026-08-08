import { readdir, readFile, writeFile, mkdir, access } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { tavily } from "@tavily/core";
import { z } from "zod";
// @ts-ignore
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
if (!process.env.OPENROUTER_API_KEY || !process.env.TAVILY_API_KEY) {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}

const { OPENROUTER_API_KEY, TAVILY_API_KEY } = process.env;

if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY in ../../.env");
  process.exit(1);
}

if (!TAVILY_API_KEY) {
  console.error("Missing TAVILY_API_KEY in ../../.env");
  process.exit(1);
}

const VERBOSE =
  process.argv.includes("--verbose") || process.argv.includes("--debug");

const MODEL = "google/gemini-2.5-flash-lite";
const ROOT_DIR = path.resolve(__dirname, "..");
const JOBS_DIR = path.join(ROOT_DIR, "data", "jobs");
const RESUME_DIR = path.join(ROOT_DIR, "data", "resume");
const ANALYSIS_DIR = path.join(ROOT_DIR, "data", "analysis");
const REPORTS_DIR = path.join(ROOT_DIR, "reports");
const RESUME_JSON_PATH = path.join(RESUME_DIR, "resume.json");
const MARKET_ANALYSIS_PATH = path.join(ANALYSIS_DIR, "market-analysis.json");
const GAP_ANALYSIS_PATH = path.join(ANALYSIS_DIR, "gap-analysis.json");
const GAP_REPORT_PATH = path.join(REPORTS_DIR, "gap-analysis.md");

const client = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const tavilyClient = tavily({ apiKey: TAVILY_API_KEY });

export const ResumeSchema = z.object({
  full_name: z.string(),
  contact: z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
  }),
  hard_skills: z.array(z.string()),
  soft_skills: z.array(z.string()),
  work_experience: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      duration: z.string(),
      responsibilities: z.array(z.string()),
      achievements: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      field: z.string(),
      year: z.string().nullable(),
      relevant_coursework: z.array(z.string()),
    }),
  ),
  certifications: z.array(z.string()),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      technologies: z.array(z.string()),
    }),
  ),
  keywords: z.array(z.string()),
});

export type Resume = z.infer<typeof ResumeSchema>;

export const GapAnalysisSchema = z.object({
  strengths: z.array(
    z.object({
      skill: z.string(),
      evidence: z.string(),
      market_demand: z.string(),
    }),
  ),
  gaps: z.array(
    z.object({
      skill: z.string(),
      frequency_in_market: z.string(),
      triage_level: z.enum([
        "quick_win",
        "short_term",
        "medium_term",
        "long_term",
      ]),
      action: z.string(),
      resources: z.string().nullable(),
    }),
  ),
  unique_value: z.array(z.string()),
  overall_assessment: z.string(),
  top_recommendations: z.array(z.string()),
});

export type GapAnalysis = z.infer<typeof GapAnalysisSchema>;

const MarketAnalysisSchema = z.object({
  most_common_skills: z.array(
    z.object({
      skill: z.string(),
      count: z.number(),
      percentage: z.number(),
    }),
  ),
  experience_levels: z.string(),
  salary_summary: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    average: z.number().nullable(),
    currency: z.string(),
    notes: z.string(),
  }),
  common_responsibilities: z.array(z.string()),
  trends_and_observations: z.array(z.string()),
  company_culture_patterns: z.string(),
  education_patterns: z.string(),
});

type MarketAnalysis = z.infer<typeof MarketAnalysisSchema>;

function debug(message: string): void {
  if (VERBOSE) {
    console.error(`[DEBUG] ${message}`);
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

function resolveResumePdfPath(): string | null {
  const arg2 = process.argv[2];
  const arg3 = process.argv[3];

  if (arg2 && arg2 !== "--verbose" && arg2 !== "--debug") {
    return path.resolve(arg2);
  }
  if (arg3 && arg3 !== "--verbose" && arg3 !== "--debug") {
    return path.resolve(arg3);
  }

  return null;
}

async function findDefaultResumePdf(): Promise<string | null> {
  try {
    const entries = await readdir(RESUME_DIR);
    const pdf = entries.find((f) => f.toLowerCase().endsWith(".pdf"));
    return pdf ? path.join(RESUME_DIR, pdf) : null;
  } catch {
    return null;
  }
}

async function webSearch(query: string): Promise<string> {
  try {
    const response = await tavilyClient.search(query, {
      maxResults: 3,
      searchDepth: "basic",
    });
    const results = response.results ?? [];
    debug(`Search returned ${results.length} results`);
    if (results.length === 0) {
      return "No search results found. Continue without external resources and note that in the gap entry.";
    }
    return results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content ?? ""}`,
      )
      .join("\n\n");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[WARN] Web search failed: ${msg}. Continuing without resources.`,
    );
    return (
      "Web search failed. Continue without resources and note this " +
      "limitation in the gap entry resources field."
    );
  }
}

const webSearchTool: OpenAI.Chat.ChatCompletionTool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for specific learning resources for skill gaps (certifications, tutorials, courses, documentation).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query for courses, certifications, or tutorials related to a skill gap.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

async function extractResume(pdfText: string): Promise<Resume> {
  const completion = await client.chat.completions.parse({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are a resume analyst. Extract structured data from the resume text.
Be thorough with hard_skills (languages, frameworks, tools, platforms), soft_skills, keywords (Agile, CI/CD, REST API, etc.), projects, and education coursework.
Do not invent experience that is not present. Use empty arrays when a section is missing.`,
      },
      {
        role: "user",
        content: `Extract structured resume data from this resume:\n\n---\n${pdfText}\n---`,
      },
    ],
    response_format: zodResponseFormat(ResumeSchema, "resume"),
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new Error(`LLM refused resume extraction: ${message.refusal}`);
  }
  if (!message?.parsed) {
    throw new Error("LLM returned no structured resume");
  }

  return ResumeSchema.parse(message.parsed);
}

async function loadOrExtractResume(resumePdfPath: string): Promise<Resume> {
  if (await fileExists(RESUME_JSON_PATH)) {
    console.error(`[SKIP] already processed: resume.json`);
    const raw = await readFile(RESUME_JSON_PATH, "utf-8");
    return ResumeSchema.parse(JSON.parse(raw) as unknown);
  }

  debug(`Reading resume from: ${resumePdfPath}`);

  let pdfText: string;
  try {
    const buffer = await readFile(resumePdfPath);
    const parsed = await pdfParse(buffer);
    pdfText = parsed.text;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read/parse resume PDF: ${msg}`);
  }

  const resume = await extractResume(pdfText);
  await mkdir(RESUME_DIR, { recursive: true });
  await writeFile(RESUME_JSON_PATH, JSON.stringify(resume, null, 2), "utf-8");
  console.error(`[OK] Saved: ${RESUME_JSON_PATH}`);

  return resume;
}

async function loadMarketAnalysis(): Promise<MarketAnalysis> {
  if (!(await fileExists(MARKET_ANALYSIS_PATH))) {
    console.error("Run phase1 first");
    process.exit(1);
  }

  const raw = await readFile(MARKET_ANALYSIS_PATH, "utf-8");
  return MarketAnalysisSchema.parse(JSON.parse(raw) as unknown);
}

async function loadJobJsons(): Promise<unknown[]> {
  try {
    const files = await readdir(JOBS_DIR);
    const jobs: unknown[] = [];
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      try {
        const raw = await readFile(path.join(JOBS_DIR, file), "utf-8");
        jobs.push(JSON.parse(raw) as unknown);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[WARN] Skipping invalid job JSON ${file}: ${msg}`);
      }
    }
    return jobs;
  } catch {
    return [];
  }
}

async function performGapAnalysis(
  resume: Resume,
  market: MarketAnalysis,
  jobs: unknown[],
): Promise<GapAnalysis> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a career coach specializing in co-op and internship readiness for software/tech roles.

Compare the candidate resume against the market analysis and job postings.
Identify strengths (skills the candidate has that the market wants) and gaps (in-demand skills they lack or under-emphasize).

Triage each gap:
- quick_win: already known or easy resume fix with no new learning (e.g. skill is in projects but missing from skills list)
- short_term: learnable in days–2 weeks
- medium_term: weeks–2 months of practice/coursework
- long_term: multi-month depth (e.g. advanced systems, specialized domain)

Quick wins are things already present in the candidate's experience or resume that just need better framing or wording — NOT new skills to learn. Examples: if the candidate has used Git but didn't list it prominently, that's a quick win. If they have project experience with a technology but used a different name than what postings use (e.g., 'Postgres' vs 'PostgreSQL'), that's a quick win. If they have relevant coursework that isn't listed under skills, that's a quick win. Always identify at least 2-3 quick wins by carefully comparing the resume skills against the job posting terminology.

Use the web_search tool to find SPECIFIC resources for the most important gaps (certification pages, free courses, tutorials with real URLs).
Call web_search a few times (at most 3 total) for different high-priority gaps, then stop.
If search fails, set resources to null and note that in the action.

Recommendations must be specific and actionable — not generic.
You MUST produce exactly 5 recommendations in top_recommendations. Count them before responding. If you only have 4, add one more specific, actionable recommendation.
Target co-op/intern / early-career fit in the overall_assessment.`,
    },
    {
      role: "user",
      content: `Perform a triaged gap analysis.

RESUME:
${JSON.stringify(resume, null, 2)}

MARKET ANALYSIS:
${JSON.stringify(market, null, 2)}

JOB POSTINGS CONTEXT (${jobs.length} postings):
${JSON.stringify(jobs, null, 2)}

First search for 1–3 concrete learning resources for the biggest gaps using web_search, then produce the structured gap analysis.`,
    },
  ];

  const maxRounds = 3;
  for (let round = 0; round < maxRounds; round++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: [webSearchTool],
      tool_choice: round === 0 ? "required" : "auto",
    });

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error("LLM returned no message during gap research");
    }

    messages.push(message);

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      break;
    }

    // Cap parallel tool calls per round to conserve API credits
    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];
      if (!toolCall || toolCall.type !== "function") continue;

      if (i > 0 || toolCall.function.name !== "web_search") {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content:
            i > 0
              ? "Skipped: limit one web_search per round."
              : `Unknown tool: ${toolCall.function.name}`,
        });
        continue;
      }

      let query = "";
      try {
        const args = JSON.parse(toolCall.function.arguments) as {
          query?: string;
        };
        query = args.query ?? "";
      } catch {
        query = "";
      }

      debug(`Tool call: web_search("${query}")`);
      const result = await webSearch(query);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  messages.push({
    role: "user",
    content:
      "Return the complete structured gap analysis now. Include concrete resource URLs from your searches where available. Ensure top_recommendations are specific and actionable. You MUST produce exactly 5 recommendations in top_recommendations. Count them before responding. If you only have 4, add one more specific, actionable recommendation. Always identify at least 2-3 quick_win gaps — these are framing/wording fixes for skills already present, NOT new skills to learn.",
  });

  const completion = await client.chat.completions.parse({
    model: MODEL,
    messages,
    response_format: zodResponseFormat(GapAnalysisSchema, "gap_analysis"),
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new Error(`LLM refused gap analysis: ${message.refusal}`);
  }
  if (!message?.parsed) {
    throw new Error("LLM returned no structured gap analysis");
  }

  return GapAnalysisSchema.parse(message.parsed);
}

function formatGapAnalysisMarkdown(analysis: GapAnalysis): string {
  const strengths = analysis.strengths
    .map(
      (s) =>
        `- **${s.skill}** — ${s.evidence} *(Market demand: ${s.market_demand})*`,
    )
    .join("\n");

  const gapRows = [
    "| Skill | Market Demand | Triage Level | Action | Resources |",
    "| --- | --- | --- | --- | --- |",
    ...analysis.gaps.map((g) => {
      const resources = (g.resources ?? "—").replace(/\|/g, "\\|");
      const action = g.action.replace(/\|/g, "\\|");
      return `| ${g.skill} | ${g.frequency_in_market} | ${g.triage_level} | ${action} | ${resources} |`;
    }),
  ].join("\n");

  const uniqueValue = analysis.unique_value.map((v) => `- ${v}`).join("\n");

  const recommendations = analysis.top_recommendations
    .slice(0, 5)
    .map((r, i) => `${i + 1}. ${r}`)
    .join("\n");

  const quickWins = analysis.gaps
    .filter((g) => g.triage_level === "quick_win")
    .map((g) => `- **${g.skill}**: ${g.action}`)
    .join("\n");

  return `# Resume Gap Analysis Report

## Executive Summary

${analysis.overall_assessment}

## Your Strengths

${strengths || "_No clear strengths identified against current market demand._"}

## Skills Gap Analysis

${gapRows}

## Unique Value Proposition

${uniqueValue || "_No unique value points identified._"}

## Top 5 Recommendations

${recommendations || "_No recommendations generated._"}

## Quick Wins

${quickWins || "_No quick wins identified — focus on short-term learning goals._"}
`;
}

async function main(): Promise<void> {
  await mkdir(RESUME_DIR, { recursive: true });
  await mkdir(ANALYSIS_DIR, { recursive: true });
  await mkdir(REPORTS_DIR, { recursive: true });

  let resumePdfPath = resolveResumePdfPath();
  if (!resumePdfPath) {
    resumePdfPath = await findDefaultResumePdf();
  }

  const hasCachedResume = await fileExists(RESUME_JSON_PATH);
  if (
    !hasCachedResume &&
    (!resumePdfPath || !(await fileExists(resumePdfPath)))
  ) {
    console.error(
      [
        "Resume PDF not found.",
        "",
        "Usage:",
        '  npm run phase2 -- "path/to/resume.pdf"',
        '  npm run phase2 -- --verbose "path/to/resume.pdf"',
        "",
        "Or place a PDF in data/resume/ and run: npm run phase2",
      ].join("\n"),
    );
    process.exit(1);
  }

  let resume: Resume;
  try {
    // resumePdfPath is guaranteed when cache is missing (checked above)
    resume = await loadOrExtractResume(resumePdfPath ?? RESUME_JSON_PATH);
    debug(
      `Extracted ${resume.hard_skills.length} hard skills, ${resume.soft_skills.length} soft skills`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] Resume extraction/validation failed: ${msg}`);
    process.exit(1);
  }

  let market: MarketAnalysis;
  try {
    market = await loadMarketAnalysis();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] Failed to load market analysis: ${msg}`);
    process.exit(1);
  }

  debug(
    `Loaded market analysis with ${market.most_common_skills.length} skills tracked`,
  );

  const jobs = await loadJobJsons();
  console.error(
    `Analyzing resume against ${jobs.length} job posting(s) and market analysis...`,
  );

  let gapAnalysis: GapAnalysis;
  try {
    gapAnalysis = await performGapAnalysis(resume, market, jobs);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] Gap analysis failed: ${msg}`);
    process.exit(1);
  }

  const triage = {
    quick_win: gapAnalysis.gaps.filter((g) => g.triage_level === "quick_win")
      .length,
    short_term: gapAnalysis.gaps.filter((g) => g.triage_level === "short_term")
      .length,
    medium_term: gapAnalysis.gaps.filter(
      (g) => g.triage_level === "medium_term",
    ).length,
    long_term: gapAnalysis.gaps.filter((g) => g.triage_level === "long_term")
      .length,
  };

  debug(
    `Gap analysis: ${gapAnalysis.strengths.length} strengths, ${gapAnalysis.gaps.length} gaps identified`,
  );
  debug(
    `Triage breakdown: ${triage.quick_win} quick wins, ${triage.short_term} short-term, ${triage.medium_term} medium-term, ${triage.long_term} long-term`,
  );

  await writeFile(
    GAP_ANALYSIS_PATH,
    JSON.stringify(gapAnalysis, null, 2),
    "utf-8",
  );
  console.error(`[OK] Wrote ${GAP_ANALYSIS_PATH}`);

  await writeFile(
    GAP_REPORT_PATH,
    formatGapAnalysisMarkdown(gapAnalysis),
    "utf-8",
  );
  console.error(`[OK] Wrote ${GAP_REPORT_PATH}`);

  console.log("Phase 2 complete.");
}

main().catch((error) => {
  console.error(
    `[FATAL] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
