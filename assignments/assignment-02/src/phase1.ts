import { readdir, readFile, writeFile, mkdir, access, unlink } from "fs/promises";
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
const ANALYSIS_DIR = path.join(ROOT_DIR, "data", "analysis");
const REPORTS_DIR = path.join(ROOT_DIR, "reports");

const client = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const tavilyClient = tavily({ apiKey: TAVILY_API_KEY });

export const JobPostingSchema = z.object({
  job_title: z.string(),
  company_name: z.string(),
  location: z.string(),
  remote_status: z.enum(["remote", "hybrid", "on-site", "not specified"]),
  posting_age_days: z.number().nullable(),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  experience_level: z.string(),
  education_requirements: z.string().nullable(),
  salary_range: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string(),
    raw: z.string().nullable(),
  }),
  key_responsibilities: z.array(z.string()),
  company_research: z.object({
    company_size: z.string().nullable(),
    industry: z.string().nullable(),
    recent_news: z.string().nullable(),
    culture_signals: z.string().nullable(),
    additional_context: z.string().nullable(),
  }),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;

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

export type MarketAnalysis = z.infer<typeof MarketAnalysisSchema>;

function debug(message: string): void {
  if (VERBOSE) {
    console.error(`[DEBUG] ${message}`);
  }
}

function toSlug(filename: string): string {
  return filename
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
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
      return "No search results found.";
    }
    return results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content ?? ""}`,
      )
      .join("\n\n");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[WARN] Web search failed: ${msg}. Continuing without company research.`);
    return (
      "Web search failed. Continue without company research and note this " +
      "limitation in company_research.additional_context."
    );
  }
}

const webSearchTool: OpenAI.Chat.ChatCompletionTool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for information about a company (size, industry, recent news, culture).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query for company research.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

async function extractJobPosting(pdfText: string): Promise<JobPosting> {
  const today = new Date().toISOString().slice(0, 10);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a job posting analyst. Today is ${today}.

Your workflow:
1. Identify the company from the job posting.
2. Call web_search EXACTLY ONCE with a single focused query about the company (size, industry, recent news, culture).
3. After the tool result, stop calling tools. Structured extraction happens in a later step.

Rules:
- Call web_search at most once. Never issue multiple tool calls.
- Calculate posting_age_days from any posted/listed date relative to today (${today}). Use null if unknown.
- remote_status must be one of: remote, hybrid, on-site, not specified.
- Put skills explicitly required into required_skills; nice-to-haves into preferred_skills.
- Extract skills thoroughly from the posting text.
- Even if the description is truncated or incomplete, extract any skills, technologies, or tools that ARE visible in the text. Do not return empty arrays if any technologies are mentioned anywhere in the posting, including in the company research section or job title.
- Infer likely required skills from the job title and any partial description visible. For example, a 'Full Stack Developer' role likely requires JavaScript/TypeScript, React or similar frontend framework, and a backend language.
- Look for skills mentioned in any section: responsibilities, requirements, nice-to-have, about the role, or anywhere in the document.
- If salary is not listed, set salary_range min/max/raw to null and currency to "CAD" when the role is in Canada, otherwise "USD".
- Never invent facts; use null or "not specified" when information is missing.
- Incorporate web research into company_research.`,
    },
    {
      role: "user",
      content: `Call web_search once to research the company in this job posting. Use one concise query.\n\n---\n${pdfText}\n---`,
    },
  ];

  // Single research round: force one tool call, execute at most two.
  const researchResponse = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools: [webSearchTool],
    tool_choice: {
      type: "function",
      function: { name: "web_search" },
    },
  });

  const researchMessage = researchResponse.choices[0]?.message;
  if (!researchMessage) {
    throw new Error("LLM returned no message during research");
  }

  messages.push(researchMessage);

  const toolCalls = researchMessage.tool_calls ?? [];

  // Execute only the first web_search; reply to any extras so the API stays valid.
  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i];
    if (!toolCall || toolCall.type !== "function") continue;

    if (i > 0 || toolCall.function.name !== "web_search") {
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content:
          i > 0
            ? "Skipped: only one web_search is allowed per posting."
            : `Unknown tool: ${toolCall.function.name}`,
      });
      continue;
    }

    let query = "";
    try {
      const args = JSON.parse(toolCall.function.arguments) as { query?: string };
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

  messages.push({
    role: "user",
    content: `Now extract the complete structured job posting. Be thorough with skills and responsibilities — pull every technology, language, framework, tool, and soft skill mentioned in the posting text below. Prefer non-empty arrays when the text mentions skills (including in the title or qualifications). Use company_research from the web search results (or note if search failed).

Even if the description is truncated or incomplete, extract any skills, technologies, or tools that ARE visible in the text. Do not return empty arrays if any technologies are mentioned anywhere in the posting, including in the company research section or job title.
Infer likely required skills from the job title and any partial description visible. For example, a 'Full Stack Developer' role likely requires JavaScript/TypeScript, React or similar frontend framework, and a backend language.
Look for skills mentioned in any section: responsibilities, requirements, nice-to-have, about the role, or anywhere in the document.

Job posting text:
---
${pdfText}
---`,
  });

  const completion = await client.chat.completions.parse({
    model: MODEL,
    messages,
    response_format: zodResponseFormat(JobPostingSchema, "job_posting"),
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new Error(`LLM refused: ${message.refusal}`);
  }

  const parsed = message?.parsed;
  if (!parsed) {
    throw new Error("LLM returned no structured job posting");
  }

  return JobPostingSchema.parse(parsed);
}

async function processPdf(filename: string): Promise<JobPosting | null> {
  const slug = toSlug(filename);
  const jsonPath = path.join(JOBS_DIR, `${slug}.json`);

  if (await fileExists(jsonPath)) {
    console.error(`[SKIP] already processed: ${filename}`);
    return null;
  }

  debug(`Processing: ${filename}`);

  let pdfText: string;
  try {
    const buffer = await readFile(path.join(JOBS_DIR, filename));
    const parsed = await pdfParse(buffer);
    pdfText = parsed.text;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] PDF parsing failed for ${filename}: ${msg}`);
    return null;
  }

  let job: JobPosting;
  try {
    job = await extractJobPosting(pdfText);
    job = JobPostingSchema.parse(job);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] LLM extraction/validation failed for ${filename}: ${msg}`);
    return null;
  }

  await writeFile(jsonPath, JSON.stringify(job, null, 2), "utf-8");
  console.error(`[OK] Saved: ${slug}.json`);

  debug(
    `Extracted ${job.required_skills.length} required skills, ${job.preferred_skills.length} preferred skills`,
  );
  debug(`Salary: ${job.salary_range.raw ?? "not listed"}`);
  debug(`posting_age_days: ${job.posting_age_days}`);

  return job;
}

async function loadAllJobJson(): Promise<JobPosting[]> {
  const files = await readdir(JOBS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const jobs: JobPosting[] = [];

  for (const file of jsonFiles) {
    try {
      const raw = await readFile(path.join(JOBS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as unknown;
      jobs.push(JobPostingSchema.parse(data));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[WARN] Skipping invalid JSON ${file}: ${msg}`);
    }
  }

  return jobs;
}

async function generateMarketAnalysis(jobs: JobPosting[]): Promise<MarketAnalysis> {
  const today = new Date().toISOString().slice(0, 10);

  const completion = await client.chat.completions.parse({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are a labor market analyst. Today is ${today}. Analyze patterns across the provided structured job postings and produce a concise market analysis.`,
      },
      {
        role: "user",
        content: `Analyze these ${jobs.length} job postings and return a structured market analysis.\n\n${JSON.stringify(jobs, null, 2)}`,
      },
    ],
    response_format: zodResponseFormat(MarketAnalysisSchema, "market_analysis"),
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new Error(`LLM refused market analysis: ${message.refusal}`);
  }
  if (!message?.parsed) {
    throw new Error("LLM returned no market analysis");
  }

  return MarketAnalysisSchema.parse(message.parsed);
}

function formatMarketAnalysisMarkdown(analysis: MarketAnalysis): string {
  const skillsTable = [
    "| Skill | Count | Percentage |",
    "| --- | ---: | ---: |",
    ...analysis.most_common_skills.map(
      (s) => `| ${s.skill} | ${s.count} | ${s.percentage}% |`,
    ),
  ].join("\n");

  const salary = analysis.salary_summary;
  const salaryLines = [
    `- **Min:** ${salary.min ?? "N/A"} ${salary.currency}`,
    `- **Max:** ${salary.max ?? "N/A"} ${salary.currency}`,
    `- **Average:** ${salary.average ?? "N/A"} ${salary.currency}`,
    `- **Notes:** ${salary.notes}`,
  ].join("\n");

  const responsibilities = analysis.common_responsibilities
    .map((r) => `- ${r}`)
    .join("\n");

  const observations = analysis.trends_and_observations
    .map((t) => `- ${t}`)
    .join("\n");

  return `# Job Market Analysis Report

## Executive Summary

This report synthesizes patterns across the collected job postings, covering in-demand skills, experience and education expectations, salary signals, common responsibilities, and company culture trends.

## Most In-Demand Skills

${skillsTable}

## Experience & Education Requirements

### Experience Levels

${analysis.experience_levels}

### Education Patterns

${analysis.education_patterns}

## Salary Landscape

${salaryLines}

## Common Responsibilities

${responsibilities}

## Company Culture & Industry Trends

${analysis.company_culture_patterns}

## Key Observations

${observations}
`;
}

async function cleanupEmptySkillJsonFiles(): Promise<void> {
  const files = await readdir(JOBS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  for (const file of jsonFiles) {
    const filePath = path.join(JOBS_DIR, file);
    try {
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw) as { required_skills?: unknown };
      if (
        !Array.isArray(data.required_skills) ||
        data.required_skills.length === 0
      ) {
        await unlink(filePath);
        console.error(`[CLEANUP] Deleted empty-skills JSON: ${file}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[WARN] Cleanup skipped ${file}: ${msg}`);
    }
  }
}

async function main(): Promise<void> {
  await mkdir(ANALYSIS_DIR, { recursive: true });
  await mkdir(REPORTS_DIR, { recursive: true });

  await cleanupEmptySkillJsonFiles();

  const entries = await readdir(JOBS_DIR);
  const pdfFiles = entries.filter((f) => f.toLowerCase().endsWith(".pdf"));

  console.error(`Found ${pdfFiles.length} PDF(s) in ${JOBS_DIR}`);

  for (const pdf of pdfFiles) {
    try {
      await processPdf(pdf);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[ERROR] Unexpected failure for ${pdf}: ${msg}`);
    }
  }

  const jobs = await loadAllJobJson();
  if (jobs.length === 0) {
    console.error("[ERROR] No job JSON files available for market analysis.");
    process.exit(1);
  }

  console.error(`Generating market analysis from ${jobs.length} posting(s)...`);

  let analysis: MarketAnalysis;
  try {
    analysis = await generateMarketAnalysis(jobs);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] Market analysis failed: ${msg}`);
    process.exit(1);
  }

  const analysisPath = path.join(ANALYSIS_DIR, "market-analysis.json");
  await writeFile(analysisPath, JSON.stringify(analysis, null, 2), "utf-8");
  console.error(`[OK] Wrote ${analysisPath}`);

  const reportPath = path.join(REPORTS_DIR, "market-analysis.md");
  await writeFile(reportPath, formatMarketAnalysisMarkdown(analysis), "utf-8");
  console.error(`[OK] Wrote ${reportPath}`);

  console.log("Phase 1 complete.");
}

const isDirectRun =
  process.argv[1] != null &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    console.error(
      `[FATAL] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
