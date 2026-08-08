import { createRequire } from "module";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { tavily } from "@tavily/core";
import { z } from "zod";

const require = createRequire(fileURLToPath(import.meta.url));
const whois = require("whois-json") as (
  domain: string,
  options?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const MODEL = "google/gemini-2.5-flash-lite";

const VERBOSE =
  process.argv.includes("--verbose") || process.argv.includes("--debug");

function debug(message: string): void {
  if (VERBOSE) {
    console.log(`[DEBUG] ${message}`);
  }
}

export const LegitimacyVerdictSchema = z.object({
  overall_verdict: z.enum(["GREEN", "YELLOW", "RED"]),
  confidence_score: z.number(),
  signals: z.array(
    z.object({
      type: z.enum(["red", "green"]),
      description: z.string(),
      evidence: z.string(),
    }),
  ),
  recommendation: z.string(),
});

export type LegitimacyVerdict = z.infer<typeof LegitimacyVerdictSchema> & {
  whois_summary: {
    domain: string | null;
    registration_date: string | null;
    registrar: string | null;
    expiration_date: string | null;
    organization: string | null;
  } | null;
};

export type JobLegitimacyInput = {
  company_name: string;
  job_title: string;
  location: string;
  salary_raw: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  description_excerpt: string;
  contact_email?: string | null;
  company_domain?: string | null;
  company_research?: {
    company_size: string | null;
    industry: string | null;
    recent_news: string | null;
    culture_signals: string | null;
    additional_context: string | null;
  };
};

export type WhoisInfo = {
  domain: string;
  registration_date: string | null;
  registrar: string | null;
  expiration_date: string | null;
  organization: string | null;
  raw_summary: string;
};

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (Array.isArray(val) && typeof val[0] === "string") return val[0].trim();
  }
  return null;
}

export async function whoisLookup(domain: string): Promise<WhoisInfo> {
  const cleaned = domain
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    ?.trim()
    .toLowerCase();

  if (!cleaned) {
    return {
      domain: domain,
      registration_date: null,
      registrar: null,
      expiration_date: null,
      organization: null,
      raw_summary: "Invalid domain",
    };
  }

  debug(`Tool call: whois_lookup("${cleaned}")`);

  try {
    const result = (await whois(cleaned)) as Record<string, unknown>;
    const registration_date = pickString(result, [
      "creationDate",
      "createdDate",
      "created",
      "Creation Date",
      "registered",
      "domainCreateDate",
      "domainNameCreateDate",
    ]);
    const registrar = pickString(result, [
      "registrar",
      "Registrar",
      "sponsoringRegistrar",
      "registrarName",
    ]);
    const expiration_date = pickString(result, [
      "registrarRegistrationExpirationDate",
      "registryExpiryDate",
      "expires",
      "expiryDate",
      "Expiration Date",
      "updated",
    ]);
    const organization = pickString(result, [
      "registrantOrganization",
      "organization",
      "organisation",
      "org",
      "Registrant Organization",
    ]);

    debug(
      `WHOIS: registered ${registration_date ?? "unknown"}, registrar: ${registrar ?? "unknown"}`,
    );

    return {
      domain: cleaned,
      registration_date,
      registrar,
      expiration_date,
      organization,
      raw_summary: JSON.stringify(
        {
          domain: cleaned,
          registration_date,
          registrar,
          expiration_date,
          organization,
        },
        null,
        2,
      ),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[WARN] WHOIS lookup failed for ${cleaned}: ${msg}`);
    return {
      domain: cleaned,
      registration_date: null,
      registrar: null,
      expiration_date: null,
      organization: null,
      raw_summary: `WHOIS lookup failed: ${msg}`,
    };
  }
}

async function webSearch(
  query: string,
  tavilyClient: ReturnType<typeof tavily>,
): Promise<string> {
  debug(`Tool call: web_search("${query}")`);
  try {
    const response = await tavilyClient.search(query, {
      maxResults: 3,
      searchDepth: "basic",
    });
    const results = response.results ?? [];
    if (results.length === 0) return "No search results found.";
    return results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content ?? ""}`,
      )
      .join("\n\n");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[WARN] Web search failed: ${msg}`);
    return `Web search failed: ${msg}. Continue with available evidence.`;
  }
}

function guessDomain(input: JobLegitimacyInput): string | null {
  if (input.company_domain) {
    return input.company_domain
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      ?.toLowerCase() ?? null;
  }
  if (input.contact_email?.includes("@")) {
    return input.contact_email.split("@")[1]?.toLowerCase() ?? null;
  }
  return null;
}

export async function assessLegitimacy(
  input: JobLegitimacyInput,
  options: {
    openrouterApiKey: string;
    tavilyApiKey: string;
  },
): Promise<LegitimacyVerdict> {
  const client = new OpenAI({
    apiKey: options.openrouterApiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });
  const tavilyClient = tavily({ apiKey: options.tavilyApiKey });

  const guessedDomain = guessDomain(input);

  const tools: OpenAI.Chat.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "web_search",
        description:
          "Search the web for company presence, careers pages, reviews, and scam reports.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "whois_lookup",
        description:
          "Look up WHOIS registration info for a company domain (registration date, registrar, expiration, organization).",
        parameters: {
          type: "object",
          properties: {
            domain: {
              type: "string",
              description: "Domain name, e.g. dayforce.com",
            },
          },
          required: ["domain"],
          additionalProperties: false,
        },
      },
    },
  ];

  let lastWhois: WhoisInfo | null = null;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a job posting legitimacy investigator. Assess whether a posting is legitimate or potentially fraudulent.

Investigate these signals:
RED FLAGS:
- Domain registered very recently (less than 1 year old)
- No verifiable web presence
- Contact email doesn't match company domain
- Salary dramatically above market rate
- Asks for PII upfront
- Job not on company careers page

GREEN FLAGS:
- Domain registered for 3+ years
- Strong web presence (LinkedIn, news, reviews)
- Email matches company domain
- Salary consistent with market data
- Job listed on official careers page
- Glassdoor/Indeed reviews exist

Use web_search and whois_lookup tools (at most 4 tool rounds total). Prefer looking up the company domain via WHOIS when a domain can be inferred.
Then produce a structured verdict: GREEN, YELLOW, or RED with confidence_score 0-100.`,
    },
    {
      role: "user",
      content: `Investigate this job posting for legitimacy.

Company: ${input.company_name}
Job title: ${input.job_title}
Location: ${input.location}
Salary: ${input.salary_raw ?? "not listed"} (min=${input.salary_min}, max=${input.salary_max}, currency=${input.currency})
Contact email: ${input.contact_email ?? "not listed"}
Inferred domain: ${guessedDomain ?? "unknown — search to find official domain"}
Company research notes: ${JSON.stringify(input.company_research ?? {}, null, 2)}

Description excerpt:
---
${input.description_excerpt.slice(0, 4000)}
---

Start by searching for the company's official site / careers page and running WHOIS on the domain.`,
    },
  ];

  for (let round = 0; round < 4; round++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: round === 0 ? "required" : "auto",
    });

    const message = response.choices[0]?.message;
    if (!message) break;

    messages.push(message);
    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) break;

    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];
      if (!toolCall || toolCall.type !== "function") continue;

      // Cap to 2 tool calls per round to conserve credits
      if (i >= 2) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Skipped: max 2 tool calls per round.",
        });
        continue;
      }

      let args: Record<string, string> = {};
      try {
        args = JSON.parse(toolCall.function.arguments) as Record<string, string>;
      } catch {
        args = {};
      }

      if (toolCall.function.name === "web_search") {
        const result = await webSearch(args.query ?? "", tavilyClient);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      } else if (toolCall.function.name === "whois_lookup") {
        const info = await whoisLookup(args.domain ?? guessedDomain ?? "");
        lastWhois = info;
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: info.raw_summary,
        });
      } else {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Unknown tool: ${toolCall.function.name}`,
        });
      }
    }
  }

  // If model never called WHOIS but we have a domain, run it ourselves for the report
  if (!lastWhois && guessedDomain) {
    lastWhois = await whoisLookup(guessedDomain);
    messages.push({
      role: "user",
      content: `Additional WHOIS data for ${guessedDomain}:\n${lastWhois.raw_summary}`,
    });
  }

  messages.push({
    role: "user",
    content: `Return the structured legitimacy verdict now based on your investigation.
WHOIS data for reference: ${lastWhois ? lastWhois.raw_summary : "unavailable"}`,
  });

  const whoisSummary = lastWhois
    ? {
        domain: lastWhois.domain,
        registration_date: lastWhois.registration_date,
        registrar: lastWhois.registrar,
        expiration_date: lastWhois.expiration_date,
        organization: lastWhois.organization,
      }
    : null;

  try {
    const completion = await client.chat.completions.parse({
      model: MODEL,
      messages,
      response_format: zodResponseFormat(
        LegitimacyVerdictSchema,
        "legitimacy_verdict",
      ),
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error("No legitimacy verdict returned");
    }

    const verdict: LegitimacyVerdict = {
      ...LegitimacyVerdictSchema.parse(parsed),
      whois_summary: whoisSummary,
    };

    debug(`Legitimacy verdict: ${verdict.overall_verdict}`);
    return verdict;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] Legitimacy assessment failed: ${msg}`);
    return {
      overall_verdict: "YELLOW",
      confidence_score: 40,
      signals: [
        {
          type: "red",
          description: "Automated legitimacy assessment incomplete",
          evidence: msg,
        },
      ],
      recommendation:
        "Could not complete full legitimacy checks. Verify the company website and careers page manually before applying or sharing personal information.",
      whois_summary: whoisSummary,
    };
  }
}
