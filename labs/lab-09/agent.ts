import { writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";
import {
  Agent,
  run,
  tool,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import { tavily } from "@tavily/core";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { OPENROUTER_API_KEY, TAVILY_API_KEY } = process.env;

if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY in ../../.env");
  process.exit(1);
}

if (!TAVILY_API_KEY) {
  console.error("Missing TAVILY_API_KEY in ../../.env");
  process.exit(1);
}

const openrouterClient = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});
setDefaultOpenAIClient(openrouterClient);
setOpenAIAPI("chat_completions");
setTracingDisabled(true);

const MODEL = "anthropic/claude-haiku-4.5";

const tavilyClient = tavily({ apiKey: TAVILY_API_KEY });

const SYSTEM_PROMPT = `You are an expert research source credibility analyst. Your job is to thoroughly investigate and evaluate the credibility of a given URL.

Follow this exact investigative process for every source:

## Step 1: Read the Source
Use read_url to fetch the article. Identify: the main claims, the author name, the publication name, and the date published.

## Step 2: Investigate the Author
Search for the author's full name, credentials, affiliations, and other published work using web_search. Are they a recognized expert on this topic?
- If no author is listed: check for an About or Team page on the same domain using read_url. Search for the article title in quotes to see if it is attributed elsewhere.
- If you still cannot find the author after 2 searches: record as Unknown and note this reduces credibility.

## Step 3: Investigate the Publication
Use read_url to fetch the site's About page (try /about, /about-us). Use web_search to find information about the publication's reputation, editorial standards, and funding.
- If the publication is unknown: note it does not automatically mean the content is wrong, but claims must be more heavily corroborated.

## Step 4: Verify the Claims
Use web_search to find 2-3 other sources reporting the same key claims. Look for fact-checks or contradicting evidence.

## Step 5: Check for Bias
Is the language neutral or emotionally charged? Does it present counterarguments? Note your observations.

## Step 6: Formal Assessment
Call the assess_credibility tool with your complete structured evaluation. Every field must be based on evidence you actually found — never guess or fabricate.

## Step 7: Write the Report
Call save_report with a filename like credibility-report-[domain].md and a complete Markdown report that includes: a summary of findings, the structured evaluation table, your verdict with reasoning, and a sources section listing every URL you read or searched.

## Handling Missing Information
- Never fabricate author credentials or publication details
- If a URL returns an error, note it and try an alternative approach
- Distinguish clearly between 'found contradicting evidence' and 'found no evidence either way'
- An honest 'I could not determine...' is always better than a guess`;

const readUrl = tool({
  name: "read_url",
  description:
    "Fetches the content of a URL via the Jina AI reader and returns the first 10000 characters.",
  parameters: z.object({
    url: z.string().describe("The URL to fetch and read."),
  }),
  execute: async ({ url }) => {
    const response = await fetch(`https://r.jina.ai/${url}`);
    if (!response.ok) {
      return `Error fetching URL (${response.status}): ${url}`;
    }
    const text = await response.text();
    return text.slice(0, 10000);
  },
});

const webSearch = tool({
  name: "web_search",
  description:
    "Searches the web for information about authors, publications, claims, and related sources.",
  parameters: z.object({
    query: z.string().describe("The search query."),
  }),
  execute: async ({ query }) => {
    const response = await tavilyClient.search(query, {
      maxResults: 5,
      searchDepth: "basic",
    });
    return JSON.stringify(response, null, 2);
  },
});

const assessCredibilitySchema = z.object({
  source_url: z.string(),
  source_type: z.enum([
    "peer_reviewed_journal",
    "news_organization",
    "government_agency",
    "nonprofit_organization",
    "corporate_blog",
    "personal_blog",
    "social_media",
    "wiki",
    "unknown",
  ]),
  author: z.object({
    name: z.string(),
    credentials: z.string(),
    credibility_assessment: z.string(),
  }),
  publication: z.object({
    name: z.string(),
    reputation: z.string(),
    editorial_process: z.enum([
      "peer_reviewed",
      "editor_reviewed",
      "self_published",
      "unknown",
    ]),
  }),
  content_analysis: z.object({
    claims_supported_by_evidence: z.boolean(),
    sources_cited: z.boolean(),
    corroborated_by_other_sources: z.boolean(),
    contradicted_by_other_sources: z.boolean(),
    primary_vs_secondary: z.enum([
      "primary_source",
      "secondary_source",
      "tertiary_source",
    ]),
    funding_or_sponsorship: z.string(),
    date_published: z.string(),
  }),
  transparency_score: z.number().int().min(1).max(5),
  overall_credibility: z.enum(["high", "medium", "low", "very_low"]),
  reasoning: z.string(),
});

const assessCredibility = tool({
  name: "assess_credibility",
  description:
    "Records a structured credibility evaluation. Call this once you have gathered enough evidence. Does not perform external actions — it organizes your thinking in context.",
  parameters: assessCredibilitySchema,
  execute: async (input) => {
    return {
      status: "evaluation_recorded",
      evaluation: input,
    };
  },
});

const saveReport = tool({
  name: "save_report",
  description:
    "Writes a Markdown credibility report to disk in the current working directory.",
  parameters: z.object({
    filename: z
      .string()
      .describe("The Markdown filename, e.g. credibility-report-example-com.md"),
    content: z.string().describe("The full Markdown report content."),
  }),
  execute: async ({ filename, content }) => {
    const safeName = path.basename(filename);
    const outputPath = path.resolve(process.cwd(), safeName);
    await writeFile(outputPath, content, "utf8");
    return `Report saved to ${outputPath}`;
  },
});

const agent = new Agent({
  name: "credibility-analyzer",
  instructions: SYSTEM_PROMPT,
  model: MODEL,
  tools: [readUrl, webSearch, assessCredibility, saveReport],
});

function describeToolCall(name: string, argsJson: string): string {
  try {
    const args: unknown = JSON.parse(argsJson);
    if (typeof args !== "object" || args === null) {
      return argsJson.slice(0, 120);
    }
    const record = args as Record<string, unknown>;
    switch (name) {
      case "read_url":
        return typeof record.url === "string" ? `Reading ${record.url}` : "Reading URL";
      case "web_search":
        return typeof record.query === "string"
          ? `Searching: ${record.query}`
          : "Searching the web";
      case "assess_credibility":
        return "Recording structured credibility assessment";
      case "save_report":
        return typeof record.filename === "string"
          ? `Saving report: ${record.filename}`
          : "Saving report";
      default:
        return argsJson.slice(0, 120);
    }
  } catch {
    return "Executing tool";
  }
}

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx tsx agent.ts <url>");
    process.exit(1);
  }

  try {
    const result = await run(
      agent,
      `Evaluate the credibility of this source: ${url}`,
      { maxTurns: 20, stream: true },
    );

    for await (const event of result) {
      if (event.type !== "run_item_stream_event") {
        continue;
      }

      if (event.name === "tool_called" && event.item.type === "tool_call_item") {
        const raw = event.item.rawItem;
        if (raw.type === "function_call") {
          const description = describeToolCall(raw.name, raw.arguments);
          console.error(`[tool] ${raw.name} — ${description}`);
        }
      }

      if (
        event.name === "tool_output" &&
        event.item.type === "tool_call_output_item"
      ) {
        const raw = event.item.rawItem;
        if (
          typeof raw === "object" &&
          raw !== null &&
          "type" in raw &&
          raw.type === "function_call_result" &&
          "name" in raw &&
          typeof raw.name === "string"
        ) {
          console.error(`[done] ${raw.name}`);
        }
      }
    }

    await result.completed;
    console.log(result.finalOutput ?? "No final output generated.");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${detail}`);
    process.exit(1);
  }
}

main();
